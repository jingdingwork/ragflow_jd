#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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
from datetime import datetime

from peewee import fn

from common.constants import StatusEnum
from api.db import TenantPermission
from api.db.db_models import DB, Search, User
from api.db.services.common_service import CommonService
from common.time_utils import current_timestamp, datetime_format


class SearchService(CommonService):
    model = Search

    @classmethod
    def save(cls, **kwargs):
        current_ts = current_timestamp()
        current_date = datetime_format(datetime.now())

        kwargs["create_time"] = current_ts
        kwargs["create_date"] = current_date
        kwargs["update_time"] = current_ts
        kwargs["update_date"] = current_date
        obj = cls.model.create(**kwargs)
        return obj

    @classmethod
    def _user_department_id(cls, user_id):
        u = User.get_or_none(User.id == user_id)
        return u.department_id if u else None

    @classmethod
    @DB.connection_context()
    def accessible4deletion(cls, search_id, user_id) -> bool:
        """Owner/creator, or a department admin governing a department-visible search."""
        search = (
            cls.model.select(cls.model.created_by, cls.model.permission, cls.model.department_id)
            .where(cls.model.id == search_id, cls.model.status == StatusEnum.VALID.value)
            .first()
        )
        if search is None:
            return False
        if search.created_by == user_id:
            return True
        if search.permission == TenantPermission.DEPARTMENT.value:
            u = User.get_or_none(User.id == user_id)
            if u and getattr(u, "is_dept_admin", False) and u.department_id and search.department_id == u.department_id:
                return True
        return False

    @classmethod
    @DB.connection_context()
    def accessible(cls, search_id, user_id) -> bool:
        """Read access: own, team within joined tenants, or department-visible same department."""
        from api.db.services.user_service import TenantService
        search = cls.model.select(
            cls.model.tenant_id, cls.model.permission, cls.model.department_id
        ).where(cls.model.id == search_id, cls.model.status == StatusEnum.VALID.value).first()
        if search is None:
            return False
        if search.tenant_id == user_id:
            return True
        if search.permission == TenantPermission.DEPARTMENT.value:
            dept = cls._user_department_id(user_id)
            return bool(dept and search.department_id == dept)
        if search.permission == TenantPermission.TEAM.value:
            joined = TenantService.get_joined_tenants_by_user_id(user_id)
            return any(t["tenant_id"] == search.tenant_id for t in joined)
        return False

    @classmethod
    @DB.connection_context()
    def get_detail(cls, search_id):
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.tenant_id,
            cls.model.name,
            cls.model.description,
            cls.model.created_by,
            cls.model.search_config,
            cls.model.update_time,
            User.nickname,
            User.avatar.alias("tenant_avatar"),
        ]
        search = (
            cls.model.select(*fields)
            .join(User, on=((User.id == cls.model.tenant_id) & (User.status == StatusEnum.VALID.value)))
            .where((cls.model.id == search_id) & (cls.model.status == StatusEnum.VALID.value))
            .first()
            .to_dict()
        )
        if not search:
            return {}
        return search

    @classmethod
    @DB.connection_context()
    def get_by_tenant_ids(cls, joined_tenant_ids, user_id, page_number, items_per_page, orderby, desc, keywords):
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.tenant_id,
            cls.model.name,
            cls.model.description,
            cls.model.created_by,
            cls.model.status,
            cls.model.update_time,
            cls.model.create_time,
            User.nickname,
            User.avatar.alias("tenant_avatar"),
        ]
        visibility = (
            (cls.model.tenant_id == user_id)
            | (cls.model.tenant_id.in_(joined_tenant_ids) & (cls.model.permission == TenantPermission.TEAM.value))
        )
        dept_id = cls._user_department_id(user_id)
        if dept_id:
            visibility = visibility | (
                (cls.model.department_id == dept_id) & (cls.model.permission == TenantPermission.DEPARTMENT.value)
            )
        query = (
            cls.model.select(*fields)
            .join(User, on=(cls.model.tenant_id == User.id))
            .where(visibility & (cls.model.status == StatusEnum.VALID.value))
        )

        if keywords:
            query = query.where(fn.LOWER(cls.model.name).contains(keywords.lower()))
        if desc:
            query = query.order_by(cls.model.getter_by(orderby).desc())
        else:
            query = query.order_by(cls.model.getter_by(orderby).asc())

        count = query.count()

        if page_number and items_per_page:
            query = query.paginate(page_number, items_per_page)

        return list(query.dicts()), count

    @classmethod
    @DB.connection_context()
    def delete_by_tenant_id(cls, tenant_id):
        return cls.model.delete().where(cls.model.tenant_id == tenant_id).execute()
