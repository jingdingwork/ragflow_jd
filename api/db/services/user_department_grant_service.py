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
"""
Manual cross-department access grants.

A grant gives a user access to a department (and its whole subtree) on top of
their OIDC-derived home department, either as an ``employee`` (read/use
department-visible resources) or as a ``dept_admin`` (also govern them).

These grants live in their own table and are never touched by OIDC sync, which
only refreshes the user's home ``department_id``. The two ``granted_*`` helpers
return subtree-expanded department-id sets that every department-visibility /
governance check ORs on top of its existing home-department condition, so a
user with no grants behaves exactly as before.
"""

from api.db.db_models import DB, UserDepartmentGrant
from api.db.services.common_service import CommonService
from api.db.services.department_service import DepartmentService
from common.constants import StatusEnum
from common.misc_utils import get_uuid

# Roles a grant may carry. ``dept_admin`` implies ``employee`` (read) plus the
# right to govern that department's department-visible resources.
VALID_ROLES = {"employee", "dept_admin"}


class UserDepartmentGrantService(CommonService):
    model = UserDepartmentGrant

    @classmethod
    @DB.connection_context()
    def list_grants(cls, user_id):
        """Return the user's valid grants as ``[{"department_id", "role"}]``."""
        if not user_id:
            return []
        rows = cls.model.select().where(
            cls.model.user_id == user_id,
            cls.model.status == StatusEnum.VALID.value,
        )
        return [{"department_id": r.department_id, "role": r.role} for r in rows]

    @classmethod
    @DB.connection_context()
    def replace_grants(cls, user_id, grants):
        """
        Full overwrite of a user's cross-department grants.

        ``grants`` is a list of ``{"department_id", "role"}``. Blank departments
        are skipped, unknown roles fall back to ``employee``, and a department
        listed more than once keeps its last role. Every existing row for the
        user is deleted first, so passing an empty list clears all grants.
        """
        wanted = {}
        for g in grants or []:
            dept_id = (g.get("department_id") or "").strip()
            if not dept_id:
                continue
            role = g.get("role") if g.get("role") in VALID_ROLES else "employee"
            wanted[dept_id] = role  # last occurrence per department wins

        cls.model.delete().where(cls.model.user_id == user_id).execute()
        for dept_id, role in wanted.items():
            cls.model.create(
                id=get_uuid(),
                user_id=user_id,
                department_id=dept_id,
                role=role,
                status=StatusEnum.VALID.value,
            )
        return {"user_id": user_id, "count": len(wanted)}

    @classmethod
    @DB.connection_context()
    def granted_read_dept_ids(cls, user_id):
        """
        Subtree-expanded set of department ids the user may READ/use via
        cross-department grants. Both ``employee`` and ``dept_admin`` roles grant
        read, so all valid grants count.
        """
        if not user_id:
            return set()
        rows = cls.model.select(cls.model.department_id).where(
            cls.model.user_id == user_id,
            cls.model.status == StatusEnum.VALID.value,
        )
        result = set()
        for r in rows:
            result |= DepartmentService.collect_subtree_ids(r.department_id)
        return result

    @classmethod
    @DB.connection_context()
    def granted_admin_dept_ids(cls, user_id):
        """
        Subtree-expanded set of department ids the user may GOVERN via
        cross-department grants. Only the ``dept_admin`` role counts.
        """
        if not user_id:
            return set()
        rows = cls.model.select(cls.model.department_id).where(
            cls.model.user_id == user_id,
            cls.model.role == "dept_admin",
            cls.model.status == StatusEnum.VALID.value,
        )
        result = set()
        for r in rows:
            result |= DepartmentService.collect_subtree_ids(r.department_id)
        return result
