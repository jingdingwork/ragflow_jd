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
"""Announcement management: admin CRUD + user-side read/view/ack.

Shared by the admin server (CRUD) and the main API server (user-facing list,
auto-popup, view counting and acknowledgement). All users can see published
announcements; view counters distinguish PV (total opens) from UV (distinct
viewers).
"""

from datetime import datetime

from api.db.db_models import DB, Announcement, AnnouncementView
from api.db.services.common_service import CommonService
from common.constants import StatusEnum
from common.misc_utils import get_uuid
from common.time_utils import current_timestamp, datetime_format


class AnnouncementService(CommonService):
    model = Announcement

    @classmethod
    def _as_dict(cls, a: Announcement) -> dict:
        return {
            "id": a.id,
            "title": a.title,
            "content": a.content or "",
            "is_pinned": bool(a.is_pinned),
            "pop_enabled": bool(a.pop_enabled),
            "view_count": int(a.view_count or 0),
            "viewer_count": int(a.viewer_count or 0),
            "status": a.status,
            "created_by": a.created_by,
            "create_time": a.create_time,
            "update_time": a.update_time,
        }

    @classmethod
    @DB.connection_context()
    def list_admin(cls) -> list[dict]:
        """Every announcement (any status), pinned first then newest first."""
        rows = (
            cls.model.select()
            .order_by(cls.model.is_pinned.desc(), cls.model.create_time.desc())
        )
        return [cls._as_dict(r) for r in rows]

    @classmethod
    @DB.connection_context()
    def list_public(cls, limit: int = 5) -> list[dict]:
        """Published announcements for the user home page, pinned first then
        newest first, capped at ``limit``."""
        rows = (
            cls.model.select()
            .where(cls.model.status == StatusEnum.VALID.value)
            .order_by(cls.model.is_pinned.desc(), cls.model.create_time.desc())
            .limit(limit)
        )
        return [cls._as_dict(r) for r in rows]

    @classmethod
    @DB.connection_context()
    def latest_popup(cls) -> dict | None:
        """The newest published, popup-enabled announcement (the one that
        auto-pops on entering home), or None."""
        row = (
            cls.model.select()
            .where(
                (cls.model.status == StatusEnum.VALID.value)
                & (cls.model.pop_enabled == True)  # noqa: E712
            )
            .order_by(cls.model.create_time.desc())
            .first()
        )
        return cls._as_dict(row) if row else None

    @classmethod
    def create(cls, data: dict, user_id: str) -> dict:
        title = (data.get("title") or "").strip()
        if not title:
            raise ValueError("Title cannot be empty.")
        aid = get_uuid()
        cls.insert(
            id=aid,
            title=title[:255],
            content=data.get("content") or "",
            is_pinned=bool(data.get("is_pinned", False)),
            pop_enabled=bool(data.get("pop_enabled", True)),
            view_count=0,
            viewer_count=0,
            created_by=user_id,
            status=StatusEnum.VALID.value,
        )
        return cls._as_dict(cls.get_by_id(aid)[1])

    @classmethod
    def update(cls, aid: str, data: dict) -> dict:
        ok, row = cls.get_by_id(aid)
        if not ok:
            raise ValueError("Announcement not found.")
        upd = {}
        if "title" in data:
            title = (data.get("title") or "").strip()
            if not title:
                raise ValueError("Title cannot be empty.")
            upd["title"] = title[:255]
        for k in ("content", "is_pinned", "pop_enabled", "status"):
            if k in data:
                upd[k] = data[k]
        if upd:
            cls.update_by_id(aid, upd)
        return cls._as_dict(cls.get_by_id(aid)[1])

    @classmethod
    def set_pinned(cls, aid: str, pinned: bool) -> dict:
        ok, _ = cls.get_by_id(aid)
        if not ok:
            raise ValueError("Announcement not found.")
        cls.update_by_id(aid, {"is_pinned": bool(pinned)})
        return cls._as_dict(cls.get_by_id(aid)[1])

    @classmethod
    def remove(cls, aid: str) -> int:
        AnnouncementViewService.filter_delete(
            [AnnouncementView.announcement_id == aid]
        )
        return cls.delete_by_id(aid)


class AnnouncementViewService(CommonService):
    model = AnnouncementView

    @classmethod
    def _insert_row(cls, announcement_id: str, user_id: str, view_times: int, acknowledged: bool) -> None:
        """Direct insert (no nested connection_context) so it is safe to call
        inside a ``DB.atomic()`` block."""
        ts = current_timestamp()
        dt = datetime_format(datetime.now())
        cls.model.insert(
            id=get_uuid(),
            announcement_id=announcement_id,
            user_id=user_id,
            view_times=view_times,
            acknowledged=acknowledged,
            create_time=ts,
            create_date=dt,
            update_time=ts,
            update_date=dt,
        ).execute()

    @classmethod
    @DB.connection_context()
    def record_view(cls, announcement_id: str, user_id: str) -> None:
        """Record one open: always bump PV; bump UV only on this user's first
        open. Runs in a transaction so the per-user row and the aggregate
        counters stay consistent."""
        with DB.atomic():
            row = cls.model.get_or_none(
                (cls.model.announcement_id == announcement_id)
                & (cls.model.user_id == user_id)
            )
            first_time = row is None
            if first_time:
                cls._insert_row(announcement_id, user_id, view_times=1, acknowledged=False)
            else:
                cls.model.update(view_times=cls.model.view_times + 1).where(
                    cls.model.id == row.id
                ).execute()
            inc = {"view_count": Announcement.view_count + 1}
            if first_time:
                inc["viewer_count"] = Announcement.viewer_count + 1
            Announcement.update(**inc).where(
                Announcement.id == announcement_id
            ).execute()

    @classmethod
    @DB.connection_context()
    def acknowledge(cls, announcement_id: str, user_id: str) -> None:
        """Mark the announcement acknowledged for this user (stops auto-popup)."""
        row = cls.model.get_or_none(
            (cls.model.announcement_id == announcement_id)
            & (cls.model.user_id == user_id)
        )
        if row is None:
            cls._insert_row(announcement_id, user_id, view_times=0, acknowledged=True)
        else:
            cls.model.update(acknowledged=True).where(
                cls.model.id == row.id
            ).execute()

    @classmethod
    @DB.connection_context()
    def is_acknowledged(cls, announcement_id: str, user_id: str) -> bool:
        row = cls.model.get_or_none(
            (cls.model.announcement_id == announcement_id)
            & (cls.model.user_id == user_id)
        )
        return bool(row and row.acknowledged)
