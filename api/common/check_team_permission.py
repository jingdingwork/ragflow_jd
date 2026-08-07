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


from api.db import TenantPermission
from api.db.db_models import File, Knowledgebase, User
from api.db.services.file_service import FileService
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.user_department_grant_service import UserDepartmentGrantService
from api.db.services.user_service import TenantService


def _user_department_id(user_id: str):
    u = User.get_or_none(User.id == user_id)
    return u.department_id if u else None


def check_file_department_permission(file: dict | File, other: str) -> bool:
    """True if the file is department-visible and `other` is in the same
    department, or has a cross-department grant (employee or dept admin) covering
    the file's department subtree."""
    file = file.to_dict() if isinstance(file, File) else file
    if file.get("permission") != TenantPermission.DEPARTMENT.value:
        return False
    file_dept = file.get("department_id")
    if not file_dept:
        return False
    if file_dept == _user_department_id(other):
        return True
    return file_dept in UserDepartmentGrantService.granted_read_dept_ids(other)


def check_file_department_manageable(file: dict | File, other: str) -> bool:
    """True if `other` may govern the department-visible file: owner, a department
    admin of its department, or a cross-department dept-admin grantee covering
    the file's department subtree."""
    file = file.to_dict() if isinstance(file, File) else file
    if file.get("created_by") == other or file.get("tenant_id") == other:
        return True
    if file.get("permission") != TenantPermission.DEPARTMENT.value:
        return False
    file_dept = file.get("department_id")
    if not file_dept:
        return False
    u = User.get_or_none(User.id == other)
    if u and getattr(u, "is_dept_admin", False) and u.department_id and file_dept == u.department_id:
        return True
    return file_dept in UserDepartmentGrantService.granted_admin_dept_ids(other)


def check_kb_team_permission(kb: dict | Knowledgebase, other: str) -> bool:
    kb = kb.to_dict() if isinstance(kb, Knowledgebase) else kb

    kb_tenant_id = kb["tenant_id"]

    if kb_tenant_id == other:
        return True

    if kb["permission"] != TenantPermission.TEAM:
        return False

    joined_tenants = TenantService.get_joined_tenants_by_user_id(other)
    return any(tenant["tenant_id"] == kb_tenant_id for tenant in joined_tenants)


def check_file_team_permission(file: dict | File, other: str) -> bool:
    file = file.to_dict() if isinstance(file, File) else file

    file_tenant_id = file["tenant_id"]
    if file_tenant_id == other:
        return True

    # Department-visible file: accessible to members of the same department
    if check_file_department_permission(file, other):
        return True

    file_id = file["id"]

    kb_ids = [kb_info["kb_id"] for kb_info in FileService.get_kb_id_by_file_id(file_id)]

    for kb_id in kb_ids:
        ok, kb = KnowledgebaseService.get_by_id(kb_id)
        if not ok:
            continue

        if check_kb_team_permission(kb, other):
            return True

    return False
