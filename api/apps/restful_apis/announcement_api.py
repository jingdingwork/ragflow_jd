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
"""User-facing announcement endpoints (home page).

All published announcements are visible to every logged-in user. Admin CRUD
lives on the admin server (see admin/server/routes.py). View counting keeps PV
(total opens) and UV (distinct viewers) separate; ``acknowledged`` tracks the
per-user "I know it" state that stops the latest announcement from auto-popping.
"""

import logging

from quart import request

from api.apps import login_required, current_user
from api.db.services.announcement_service import (
    AnnouncementService,
    AnnouncementViewService,
)
from api.utils.api_utils import get_json_result
from common.constants import RetCode


@manager.route("/announcements", methods=["GET"])  # noqa: F821
@login_required
async def list_announcements():
    try:
        limit = request.args.get("limit", default=5, type=int) or 5
        limit = max(1, min(limit, 50))
        items = AnnouncementService.list_public(limit)
        for it in items:
            it["acknowledged"] = AnnouncementViewService.is_acknowledged(it["id"], current_user.id)
        return get_json_result(data=items)
    except Exception as e:
        logging.exception(e)
        return get_json_result(message=str(e), code=RetCode.SERVER_ERROR)


@manager.route("/announcements/latest", methods=["GET"])  # noqa: F821
@login_required
async def latest_announcement():
    """The newest published, popup-enabled announcement plus this user's
    acknowledgement state, so the client knows whether to auto-pop it."""
    try:
        item = AnnouncementService.latest_popup()
        if item:
            item["acknowledged"] = AnnouncementViewService.is_acknowledged(item["id"], current_user.id)
        return get_json_result(data=item)
    except Exception as e:
        logging.exception(e)
        return get_json_result(message=str(e), code=RetCode.SERVER_ERROR)


@manager.route("/announcements/<announcement_id>/view", methods=["POST"])  # noqa: F821
@login_required
async def view_announcement(announcement_id):
    """Record one open (bumps PV, and UV on this user's first open)."""
    try:
        AnnouncementViewService.record_view(announcement_id, current_user.id)
        return get_json_result(data=True)
    except Exception as e:
        logging.exception(e)
        return get_json_result(message=str(e), code=RetCode.SERVER_ERROR)


@manager.route("/announcements/<announcement_id>/ack", methods=["POST"])  # noqa: F821
@login_required
async def ack_announcement(announcement_id):
    """Mark acknowledged for this user; stops the auto-popup."""
    try:
        AnnouncementViewService.acknowledge(announcement_id, current_user.id)
        return get_json_result(data=True)
    except Exception as e:
        logging.exception(e)
        return get_json_result(message=str(e), code=RetCode.SERVER_ERROR)
