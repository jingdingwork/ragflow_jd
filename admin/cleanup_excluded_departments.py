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
One-off cleanup: remove locally-synced accounts that belong to excluded
departments (WeChat / 特殊账号 / 项目统一邮箱), along with those department nodes
and their model config.

Dry run (default, only prints what would happen):
    PYTHONPATH=. .venv/Scripts/python.exe admin/cleanup_excluded_departments.py

Actually delete:
    PYTHONPATH=. .venv/Scripts/python.exe admin/cleanup_excluded_departments.py --apply
"""
import sys

from api.db.db_models import DB, Department, DepartmentLLM, DepartmentLLMModel
from api.db.services.user_service import UserService
from api.db.services.department_service import is_excluded_department
from api.db.joint_services.user_account_service import delete_user_data
from common.constants import ActiveEnum

APPLY = "--apply" in sys.argv


def main():
    with DB.connection_context():
        excluded_depts = [d for d in Department.select() if is_excluded_department(d.name)]
        dept_ids = [d.id for d in excluded_depts]

    print("Excluded departments found:")
    for d in excluded_depts:
        print(f"  - {d.name} (id={d.id}, path={d.path_key})")

    # Collect users belonging to those departments (never touch superusers)
    users = []
    for did in dept_ids:
        users.extend(UserService.query(department_id=did))
    users = [u for u in users if not u.is_superuser]

    print(f"\nUsers to delete: {len(users)}")
    for u in users:
        print(f"  - {u.email}  ({u.nickname})  active={u.is_active}")

    if not APPLY:
        print("\nDRY RUN — nothing deleted. Re-run with --apply to perform deletion.")
        return

    deleted, failed = 0, 0
    for u in users:
        try:
            # delete_user_data refuses active users, so deactivate first
            if u.is_active == ActiveEnum.ACTIVE.value:
                UserService.update_user(u.id, {"is_active": ActiveEnum.INACTIVE.value})
            res = delete_user_data(u.id)
            if res.get("success"):
                deleted += 1
            else:
                failed += 1
                print(f"  SKIP {u.email}: {res.get('message')}")
        except Exception as e:
            failed += 1
            print(f"  ERROR {u.email}: {e}")

    # Remove the department model config + the department nodes themselves
    with DB.connection_context():
        for did in dept_ids:
            DepartmentLLMModel.delete().where(DepartmentLLMModel.department_id == did).execute()
            DepartmentLLM.delete().where(DepartmentLLM.department_id == did).execute()
        for d in excluded_depts:
            Department.delete().where(Department.id == d.id).execute()

    print(f"\nDONE. users_deleted={deleted}, failed={failed}, departments_removed={len(excluded_depts)}")


if __name__ == "__main__":
    main()
