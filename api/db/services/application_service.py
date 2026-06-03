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

from api.db.db_models import (
    DB,
    Application,
    ApplicationVersion,
    ApplicationVisibility,
    Department,
)
from api.db.services.common_service import CommonService
from common.constants import StatusEnum

# Bucket that holds uploaded application installation packages (exe/msi/zip).
APP_PACKAGE_BUCKET = "application-packages"


class ApplicationService(CommonService):
    model = Application


class ApplicationVersionService(CommonService):
    model = ApplicationVersion


class ApplicationVisibilityService(CommonService):
    model = ApplicationVisibility


@DB.connection_context()
def _department_subtree_map():
    """Return {parent_id: [child_id, ...]} for all valid departments."""
    children = {}
    rows = Department.select(Department.id, Department.parent_id).where(
        Department.status == StatusEnum.VALID.value
    )
    for r in rows:
        children.setdefault(r.parent_id, []).append(r.id)
    return children


def _descendant_ids(root_ids, children_map):
    """Expand a set of department ids to include all of their descendants."""
    result = set()
    stack = list(root_ids)
    while stack:
        cur = stack.pop()
        if cur in result:
            continue
        result.add(cur)
        for child in children_map.get(cur, []):
            if child not in result:
                stack.append(child)
    return result


@DB.connection_context()
def resolve_visible_app_ids(department_id):
    """
    Return the set of application ids visible to a user in ``department_id``.

    Visibility semantics:
      - ``visibility == 'all'``  -> visible to everyone.
      - ``visibility == 'dept'`` -> visible if the user's department is one of the
        authorized departments **or any descendant of them** (subtree inheritance):
        authorizing a department grants its whole branch.
    """
    visible = set()

    # 1. Apps shared with everyone.
    for app in Application.select(Application.id).where(
        Application.status == StatusEnum.VALID.value,
        Application.visibility == "all",
    ):
        visible.add(app.id)

    if not department_id:
        return visible

    # 2. Walk the department's ancestor chain; an app authorized on any ancestor
    #    (or the department itself) is visible (= subtree inheritance, resolved
    #    bottom-up so we don't need to expand every authorized subtree).
    ancestor_ids = set()
    cur = department_id
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        ancestor_ids.add(cur)
        dept = Department.get_or_none(Department.id == cur)
        cur = dept.parent_id if dept else None

    if ancestor_ids:
        for row in ApplicationVisibility.select(ApplicationVisibility.application_id).where(
            ApplicationVisibility.department_id.in_(list(ancestor_ids)),
            ApplicationVisibility.status == StatusEnum.VALID.value,
        ):
            visible.add(row.application_id)

    return visible


@DB.connection_context()
def get_visibility_department_ids(application_id):
    """Return the list of department ids explicitly authorized for an application."""
    return [
        r.department_id
        for r in ApplicationVisibility.select(ApplicationVisibility.department_id).where(
            ApplicationVisibility.application_id == application_id,
            ApplicationVisibility.status == StatusEnum.VALID.value,
        )
    ]


@DB.connection_context()
def list_versions(application_id):
    """Return an application's versions, latest/newest first."""
    rows = ApplicationVersion.select().where(
        ApplicationVersion.application_id == application_id,
        ApplicationVersion.status == StatusEnum.VALID.value,
    )
    versions = list(rows)
    versions.sort(key=lambda v: (0 if v.is_latest else 1, -(v.create_time or 0)))
    return versions
