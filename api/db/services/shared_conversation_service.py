#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
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
from copy import deepcopy

from api.db.db_models import DB, SharedConversation
from api.db.services.common_service import CommonService
from api.db.services.department_service import DepartmentService
from common.constants import StatusEnum
from common.misc_utils import get_uuid

VISIBILITY_PENDING = "pending"
VISIBILITY_DEPARTMENT = "department"


class SharedConversationService(CommonService):
    """Department-shared chat snapshots.

    A normal user's share is created as ``pending`` (only department admins see
    it); a department admin can publish it to ``department`` (all members see
    it). Admins can also hide or soft-delete copies. See [[SharedConversation]].
    """

    model = SharedConversation

    @classmethod
    @DB.connection_context()
    def create_from_session(cls, user, session_conv, message_ids, name=None):
        """Snapshot the selected turns of ``session_conv`` into a new shared copy.

        ``message_ids`` is the flat list of message ids belonging to the selected
        Q&A turns. References are aligned per assistant turn (the k-th assistant
        message — counting the prologue as ordinal 0 — maps to ``reference[k-1]``),
        matching the index math used by ``delete_session_message``.
        """
        selected = set(message_ids or [])
        orig_msgs = session_conv.message or []
        orig_refs = session_conv.reference or []

        snap_msgs = []
        snap_refs = []
        assistant_ordinal = -1  # the prologue (first assistant) becomes ordinal 0
        for m in orig_msgs:
            is_assistant = m.get("role") == "assistant"
            if is_assistant:
                assistant_ordinal += 1
            if m.get("id") not in selected:
                continue
            snap_msgs.append(deepcopy(m))
            if is_assistant:
                ref_idx = assistant_ordinal - 1
                if 0 <= ref_idx < len(orig_refs):
                    snap_refs.append(deepcopy(orig_refs[ref_idx]))
                else:
                    snap_refs.append([])

        visibility = VISIBILITY_DEPARTMENT if getattr(user, "is_dept_admin", False) else VISIBILITY_PENDING
        row = {
            "id": get_uuid(),
            "source_session_id": session_conv.id,
            "dialog_id": session_conv.dialog_id,
            "department_id": getattr(user, "department_id", None),
            "owner_id": user.id,
            "owner_name": getattr(user, "nickname", None),
            "name": (name or session_conv.name or "Shared conversation")[:255],
            "message": snap_msgs,
            "reference": snap_refs,
            "visibility": visibility,
            "hidden": False,
            "status": StatusEnum.VALID.value,
        }
        cls.save(**row)
        ok, obj = cls.get_by_id(row["id"])
        return obj if ok else None

    @classmethod
    def _can_manage(cls, user, row):
        """Department admins govern every copy within their department subtree."""
        return bool(getattr(user, "is_dept_admin", False))

    @classmethod
    def _can_delete(cls, user, row):
        """Admins delete anything; owners may withdraw their own pending copy."""
        if cls._can_manage(user, row):
            return True
        return row.owner_id == user.id and row.visibility == VISIBILITY_PENDING

    @classmethod
    def _decorate(cls, user, row):
        is_admin = cls._can_manage(user, row)
        is_pending = row.visibility == VISIBILITY_PENDING
        data = {
            "id": row.id,
            "name": row.name,
            "owner_id": row.owner_id,
            "owner_name": row.owner_name,
            "visibility": row.visibility,
            "hidden": bool(row.hidden),
            "create_time": row.create_time,
            "sort": row.sort,
            "is_mine": row.owner_id == user.id,
            "is_pending": is_pending,
            "is_hidden": bool(row.hidden),
            "can_publish": is_admin and is_pending,
            "can_hide": is_admin,
            "can_delete": cls._can_delete(user, row),
            "can_rename": is_admin,
            "can_reorder": is_admin,
        }
        return data

    @classmethod
    @DB.connection_context()
    def list_visible(cls, user):
        """Shared copies visible to ``user`` within their department subtree.

        Members see published, non-hidden copies plus their own pending copies.
        Department admins see everything in the subtree (pending and hidden
        included) so they can review, publish, hide/unhide and delete.
        """
        dept_id = getattr(user, "department_id", None)
        subtree = DepartmentService.collect_subtree_ids(dept_id) if dept_id else set()
        is_admin = bool(getattr(user, "is_dept_admin", False))

        q = cls.model.select().where(
            cls.model.status == StatusEnum.VALID.value,
        )
        rows = []
        for row in q.order_by(cls.model.sort.asc(), cls.model.create_time.desc()):
            if row.department_id not in subtree:
                continue
            if is_admin:
                rows.append(row)
                continue
            if row.owner_id == user.id and row.visibility == VISIBILITY_PENDING:
                rows.append(row)
            elif row.visibility == VISIBILITY_DEPARTMENT and not row.hidden:
                rows.append(row)
        return [cls._decorate(user, row) for row in rows]

    @classmethod
    @DB.connection_context()
    def _is_visible_to(cls, user, row):
        """Whether ``user`` may view ``row`` (same rules as list_visible)."""
        subtree = DepartmentService.collect_subtree_ids(getattr(user, "department_id", None))
        if row.department_id not in subtree:
            return False
        if cls._can_manage(user, row):
            return True
        if row.owner_id == user.id and row.visibility == VISIBILITY_PENDING:
            return True
        return row.visibility == VISIBILITY_DEPARTMENT and not row.hidden

    @classmethod
    @DB.connection_context()
    def get_detail(cls, user, shared_id):
        """Return the decorated row plus its message/reference snapshot, or None
        when the copy does not exist or is not visible to ``user``."""
        ok, row = cls.get_by_id(shared_id)
        if not ok or row.status != StatusEnum.VALID.value:
            return None
        if not cls._is_visible_to(user, row):
            return None
        data = cls._decorate(user, row)
        data["messages"] = row.message or []
        data["reference"] = row.reference or []
        return data

    @classmethod
    @DB.connection_context()
    def publish(cls, user, shared_id):
        ok, row = cls.get_by_id(shared_id)
        if not ok or row.status != StatusEnum.VALID.value:
            return False, "Shared conversation not found!"
        if not cls._can_manage(user, row) or row.department_id not in DepartmentService.collect_subtree_ids(getattr(user, "department_id", None)):
            return False, "No authorization."
        cls.update_by_id(shared_id, {"visibility": VISIBILITY_DEPARTMENT, "hidden": False})
        return True, ""

    @classmethod
    @DB.connection_context()
    def set_hidden(cls, user, shared_id, hidden):
        ok, row = cls.get_by_id(shared_id)
        if not ok or row.status != StatusEnum.VALID.value:
            return False, "Shared conversation not found!"
        if not cls._can_manage(user, row) or row.department_id not in DepartmentService.collect_subtree_ids(getattr(user, "department_id", None)):
            return False, "No authorization."
        cls.update_by_id(shared_id, {"hidden": bool(hidden)})
        return True, ""

    @classmethod
    @DB.connection_context()
    def remove(cls, user, shared_id):
        ok, row = cls.get_by_id(shared_id)
        if not ok or row.status != StatusEnum.VALID.value:
            return False, "Shared conversation not found!"
        if not cls._can_delete(user, row):
            return False, "No authorization."
        if cls._can_manage(user, row) and row.department_id not in DepartmentService.collect_subtree_ids(getattr(user, "department_id", None)):
            return False, "No authorization."
        cls.update_by_id(shared_id, {"status": StatusEnum.INVALID.value})
        return True, ""

    @classmethod
    @DB.connection_context()
    def rename(cls, user, shared_id, name):
        """Department admins may rename any copy within their subtree."""
        ok, row = cls.get_by_id(shared_id)
        if not ok or row.status != StatusEnum.VALID.value:
            return False, "Shared conversation not found!"
        if not cls._can_manage(user, row) or row.department_id not in DepartmentService.collect_subtree_ids(getattr(user, "department_id", None)):
            return False, "No authorization."
        name = (name or "").strip()
        if not name:
            return False, "`name` can not be empty."
        cls.update_by_id(shared_id, {"name": name[:255]})
        return True, ""

    @classmethod
    @DB.connection_context()
    def reorder(cls, user, ordered_ids):
        """Persist the share-zone display order. Department admins only; only ids
        within the admin's subtree are touched, in the given order."""
        if not getattr(user, "is_dept_admin", False):
            return False, "No authorization."
        subtree = DepartmentService.collect_subtree_ids(getattr(user, "department_id", None))
        sort_value = 0
        for shared_id in ordered_ids or []:
            ok, row = cls.get_by_id(shared_id)
            if not ok or row.status != StatusEnum.VALID.value:
                continue
            if row.department_id not in subtree:
                continue
            cls.update_by_id(shared_id, {"sort": sort_value})
            sort_value += 1
        return True, ""
