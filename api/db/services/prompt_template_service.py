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

from api.db.db_models import DB, PromptTemplate
from api.db.services.common_service import CommonService
from common.constants import StatusEnum
from common.misc_utils import get_uuid

SCOPE_DEFAULT = "default"
SCOPE_DEPARTMENT = "department"
VALID_SCOPES = {SCOPE_DEFAULT, SCOPE_DEPARTMENT}

# Ultimate fallback used only when no template is configured at all. Kept in sync
# with the historical hard-coded default in api/apps/restful_apis/chat_api.py.
FALLBACK_SYSTEM = (
    "You are an intelligent assistant. Please summarize the content of the dataset to answer the question. "
    "Please list the data in the dataset and answer in detail. When all dataset content is irrelevant to the "
    'question, your answer must include the sentence "The answer you are looking for is not found in the dataset!" '
    "Answers need to consider chat history.\n"
    "      Here is the knowledge base:\n"
    "      {knowledge}\n"
    "      The above is the knowledge base."
)
FALLBACK_PROLOGUE = "Hi! I'm your assistant. What can I do for you?"


def _serialize(t):
    return {
        "id": t.id,
        "name": t.name,
        "scope": t.scope,
        "department_id": t.department_id or "",
        "system": t.system or "",
        "prologue": t.prologue or "",
        "is_default": bool(t.is_default),
        "sort": t.sort,
        "create_time": t.create_time,
        "update_time": t.update_time,
    }


def _order_key(item):
    # default scope first, then by sort, then by name
    return (0 if item["scope"] == SCOPE_DEFAULT else 1, item.get("sort", 0), item.get("name", ""))


class PromptTemplateService(CommonService):
    model = PromptTemplate

    @classmethod
    @DB.connection_context()
    def list_all(cls):
        """Every valid template; default-scope templates first, then department ones."""
        rows = cls.model.select().where(cls.model.status == StatusEnum.VALID.value)
        items = [_serialize(r) for r in rows]
        items.sort(key=_order_key)
        return items

    @classmethod
    @DB.connection_context()
    def list_for_user(cls, department_id):
        """Templates available to a user: all global defaults + that user's department's."""
        cond = cls.model.scope == SCOPE_DEFAULT
        if department_id:
            cond = cond | ((cls.model.scope == SCOPE_DEPARTMENT) & (cls.model.department_id == department_id))
        rows = cls.model.select().where(cls.model.status == StatusEnum.VALID.value, cond)
        items = [_serialize(r) for r in rows]
        items.sort(key=_order_key)
        return items

    @classmethod
    @DB.connection_context()
    def _clear_default(cls, scope, department_id, exclude_id=None):
        """Unset is_default on other templates sharing the same scope/department."""
        filters = [cls.model.scope == scope, cls.model.is_default == True]  # noqa: E712
        if scope == SCOPE_DEPARTMENT:
            filters.append(cls.model.department_id == department_id)
        if exclude_id:
            filters.append(cls.model.id != exclude_id)
        cls.model.update({cls.model.is_default: False}).where(*filters).execute()

    @classmethod
    def create_template(cls, name, scope, department_id, system, prologue, is_default=False, sort=0):
        scope = scope if scope in VALID_SCOPES else SCOPE_DEPARTMENT
        department_id = department_id if scope == SCOPE_DEPARTMENT else None
        if scope == SCOPE_DEPARTMENT and not department_id:
            raise ValueError("department_id is required when scope=department.")
        tid = get_uuid()
        cls.insert(
            id=tid,
            name=(name or "").strip() or "Untitled",
            scope=scope,
            department_id=department_id,
            system=system or "",
            prologue=prologue or "",
            is_default=bool(is_default),
            sort=int(sort or 0),
            status=StatusEnum.VALID.value,
        )
        if is_default:
            cls._clear_default(scope, department_id, exclude_id=tid)
        return tid

    @classmethod
    def update_template(cls, template_id, **fields):
        ok, row = cls.get_by_id(template_id)
        if not ok:
            raise ValueError(f"Prompt template not found: {template_id}")
        data = {}
        for key in ("name", "system", "prologue", "sort", "is_default"):
            if key in fields and fields[key] is not None:
                data[key] = fields[key]
        if "name" in data:
            data["name"] = (data["name"] or "").strip() or row.name
        if "is_default" in data:
            data["is_default"] = bool(data["is_default"])
        if "sort" in data:
            data["sort"] = int(data["sort"] or 0)
        cls.update_by_id(template_id, data)
        if data.get("is_default"):
            cls._clear_default(row.scope, row.department_id, exclude_id=template_id)
        return True

    @classmethod
    def delete_template(cls, template_id):
        return cls.update_by_id(template_id, {"status": StatusEnum.INVALID.value})

    @classmethod
    def _pick_template(cls, scope, department_id):
        """Pick the active template for a scope.

        Prefer the one explicitly marked default, but fall back to any template in
        that scope (ordered by sort, then name) so an admin who configures a
        department/global prompt without toggling "set as default" still has it
        take effect. Returns a model row or None. Must be called within a DB
        connection context.
        """
        filters = [cls.model.scope == scope, cls.model.status == StatusEnum.VALID.value]
        if scope == SCOPE_DEPARTMENT:
            filters.append(cls.model.department_id == department_id)
        rows = list(cls.model.select().where(*filters))
        if not rows:
            return None
        rows.sort(key=lambda r: (0 if r.is_default else 1, r.sort or 0, r.name or ""))
        return rows[0]

    @classmethod
    @DB.connection_context()
    def get_default_for_user(cls, department_id):
        """The preselected template for a user: department → global → fallback.

        Within each scope, an explicitly defaulted template wins; otherwise the
        first available template for that scope is used.
        """
        if department_id:
            dept = cls._pick_template(SCOPE_DEPARTMENT, department_id)
            if dept:
                return {"system": dept.system or "", "prologue": dept.prologue or ""}
        glob = cls._pick_template(SCOPE_DEFAULT, None)
        if glob:
            return {"system": glob.system or "", "prologue": glob.prologue or ""}
        return {"system": FALLBACK_SYSTEM, "prologue": FALLBACK_PROLOGUE}

    @classmethod
    @DB.connection_context()
    def resolve(cls, template_id, department_id=None):
        """Resolve {system, prologue} for chat creation.

        Use the explicitly chosen template when valid; otherwise fall back to the
        user's default template (department → global → hard-coded fallback).
        """
        if template_id:
            row = cls.get_or_none(id=template_id, status=StatusEnum.VALID.value)
            # Only accept a global template, or a department template belonging to
            # the requesting user's department. Anything else falls back to default
            # so a client cannot snapshot another department's template by id.
            if row and (
                row.scope == SCOPE_DEFAULT
                or (row.scope == SCOPE_DEPARTMENT and row.department_id == department_id)
            ):
                return {"system": row.system or "", "prologue": row.prologue or ""}
            logging.warning(f"PromptTemplateService.resolve: template {template_id} not visible/found, using default.")
        return cls.get_default_for_user(department_id)
