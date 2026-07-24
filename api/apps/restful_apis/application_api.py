#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
import logging
import re
from urllib.parse import quote

from quart import request, make_response

from api.apps import login_required, current_user
from api.db.services.application_service import (
    ApplicationService,
    ApplicationVersionService,
    APP_PACKAGE_BUCKET,
    build_department_app_map,
    resolve_visible_app_ids,
    list_versions,
)
from api.utils.api_utils import get_json_result, get_data_error_result, server_error_response
from common.constants import StatusEnum
from common.misc_utils import thread_pool_exec
from common import settings


def _version_to_dict(v):
    return {
        "id": v.id,
        "version": v.version,
        "description": v.description,
        "file_name": v.file_name,
        "file_size": v.file_size,
        "is_latest": bool(v.is_latest),
        "create_date": str(v.create_date) if v.create_date else None,
    }


@manager.route("/application/mine", methods=["GET"])  # noqa: F821
@login_required
def my_applications():
    """List applications visible to the current user (subtree-inherited department visibility)."""
    try:
        department_id = getattr(current_user, "department_id", None)
        visible_ids = resolve_visible_app_ids(department_id)
        if not visible_ids:
            return get_json_result(data=[])

        apps = []
        for app in ApplicationService.get_by_ids(list(visible_ids)):
            if app.status != StatusEnum.VALID.value:
                continue
            versions = list_versions(app.id)
            latest = next((v for v in versions if v.is_latest), versions[0] if versions else None)
            apps.append(
                {
                    "id": app.id,
                    "name": app.name,
                    "description": app.description,
                    "icon": app.icon,
                    "app_type": app.app_type,
                    "url": app.url,
                    "sort": app.sort,
                    "latest_version": _version_to_dict(latest) if latest else None,
                    "versions": [_version_to_dict(v) for v in versions],
                }
            )
        apps.sort(key=lambda a: (a["sort"] or 0, a["name"] or ""))
        return get_json_result(data=apps)
    except Exception as e:
        return server_error_response(e)


@manager.route("/application/catalog", methods=["GET"])  # noqa: F821
@login_required
def application_catalog():
    """
    Department → application catalog for the user portal.

    Returns every department together with the applications available to it, so a
    user can browse other departments read-only. Each application carries an
    ``accessible`` flag: only the ones the current user may actually open or
    download expose their ``url`` / installation packages.
    """
    try:
        department_id = getattr(current_user, "department_id", None)
        accessible_ids = resolve_visible_app_ids(department_id)
        departments, dept_app_ids, public_app_ids = build_department_app_map()

        referenced = set(public_app_ids)
        for ids in dept_app_ids.values():
            referenced |= ids
        if not referenced:
            return get_json_result(
                data={
                    "departments": [],
                    "applications": [],
                    "public_app_ids": [],
                    "my_department_id": department_id,
                }
            )

        apps = []
        valid_ids = set()
        for app in ApplicationService.get_by_ids(list(referenced)):
            if app.status != StatusEnum.VALID.value:
                continue
            valid_ids.add(app.id)
            accessible = app.id in accessible_ids
            versions = list_versions(app.id) if accessible else []
            latest = next((v for v in versions if v.is_latest), versions[0] if versions else None)
            apps.append(
                {
                    "id": app.id,
                    "name": app.name,
                    "description": app.description,
                    "icon": app.icon,
                    "app_type": app.app_type,
                    # Withhold the entry point from users without permission.
                    "url": app.url if accessible else None,
                    "sort": app.sort,
                    "visibility": app.visibility,
                    "accessible": accessible,
                    "latest_version": _version_to_dict(latest) if latest else None,
                    "versions": [_version_to_dict(v) for v in versions],
                }
            )
        apps.sort(key=lambda a: (a["sort"] or 0, a["name"] or ""))

        # Company-wide applications are listed under their own node on the client,
        # so a department only carries what was authorized on it (or an ancestor).
        for dept in departments:
            dept["app_ids"] = sorted(dept_app_ids.get(dept["id"], set()) & valid_ids)

        return get_json_result(
            data={
                "departments": departments,
                "applications": apps,
                "public_app_ids": sorted(public_app_ids & valid_ids),
                "my_department_id": department_id,
            }
        )
    except Exception as e:
        return server_error_response(e)


@manager.route("/application/<application_id>/download", methods=["GET"])  # noqa: F821
@login_required
async def download_application(application_id):
    """Download an application's installation package (specific version, or the latest)."""
    try:
        department_id = getattr(current_user, "department_id", None)
        visible_ids = resolve_visible_app_ids(department_id)
        if application_id not in visible_ids:
            return get_data_error_result(message="Application not found or not accessible")

        version_id = request.args.get("version")
        if version_id:
            version = ApplicationVersionService.get_or_none(
                id=version_id, application_id=application_id
            )
        else:
            versions = list_versions(application_id)
            version = next((v for v in versions if v.is_latest), versions[0] if versions else None)

        if not version or not version.file_key:
            return get_data_error_result(message="No installation package available")

        blob = await thread_pool_exec(settings.STORAGE_IMPL.get, APP_PACKAGE_BUCKET, version.file_key)
        if not blob:
            return get_data_error_result(message="Installation package is missing in storage")

        response = await make_response(blob)
        response.headers.set("Content-Type", "application/octet-stream")
        file_name = version.file_name or "package"
        # ASCII fallback + RFC 5987 encoded form for non-ASCII names.
        ascii_name = re.sub(r"[^\x20-\x7e]", "_", file_name)
        response.headers.set(
            "Content-Disposition",
            f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file_name)}",
        )
        return response
    except Exception as e:
        logging.exception(e)
        return server_error_response(e)
