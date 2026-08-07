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
    Return the set of application ids visible to a user.

    ``department_id`` may be a single department id or an iterable of ids (a
    user's home department plus any cross-department grants); an app visible to
    any of them is included.

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

    start_ids = [department_id] if isinstance(department_id, str) else [d for d in department_id if d]
    if not start_ids:
        return visible

    # 2. Walk each starting department's ancestor chain; an app authorized on any
    #    ancestor (or the department itself) is visible (= subtree inheritance,
    #    resolved bottom-up so we don't need to expand every authorized subtree).
    #    ``ancestor_ids`` doubles as the visited set, so shared ancestors and
    #    cycles are each walked only once.
    ancestor_ids = set()
    for start in start_ids:
        cur = start
        while cur and cur not in ancestor_ids:
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
def build_department_app_map():
    """
    Return ``(departments, dept_app_ids, public_app_ids)`` for the user-side portal.

    ``departments`` is every valid department (id/name/parent_id). ``dept_app_ids``
    maps a department id to the ids of the applications *available to that
    department* — i.e. authorized on it or on any of its ancestors (subtree
    inheritance, mirroring :func:`resolve_visible_app_ids`). ``public_app_ids``
    holds the ``visibility == 'all'`` applications, which every department gets.
    """
    departments = [
        {"id": d.id, "name": d.name, "parent_id": d.parent_id}
        for d in Department.select(Department.id, Department.name, Department.parent_id).where(
            Department.status == StatusEnum.VALID.value
        )
    ]
    parent_of = {d["id"]: d["parent_id"] for d in departments}

    public_app_ids = set()
    dept_scoped_ids = set()
    for app in Application.select(Application.id, Application.visibility).where(
        Application.status == StatusEnum.VALID.value
    ):
        if app.visibility == "all":
            public_app_ids.add(app.id)
        else:
            dept_scoped_ids.add(app.id)

    direct = {}
    for row in ApplicationVisibility.select(
        ApplicationVisibility.application_id, ApplicationVisibility.department_id
    ).where(ApplicationVisibility.status == StatusEnum.VALID.value):
        # A company-wide application belongs to the company node only; stale
        # per-department rows from before it was switched to ``all`` must not
        # light up department branches.
        if row.application_id not in dept_scoped_ids:
            continue
        direct.setdefault(row.department_id, set()).add(row.application_id)

    dept_app_ids = {}
    for dept in departments:
        ids = set()
        cur = dept["id"]
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            ids |= direct.get(cur, set())
            cur = parent_of.get(cur)
        dept_app_ids[dept["id"]] = ids

    return departments, dept_app_ids, public_app_ids


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
