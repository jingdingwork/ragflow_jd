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
"""User-facing feedback endpoint (top-right header dialog).

Any logged-in user can submit product feedback / an optimization suggestion,
choosing the affected modules (chat / knowledge / app), a 1-5 star priority, a
text body, and optionally pasted screenshots. Screenshots are stored in the
MinIO ``feedback`` bucket; only their object keys are persisted on the row.
Triage / resolution lives entirely on the admin server (admin/server/routes.py).
"""

import json
import logging

from quart import request

from api.apps import login_required, current_user
from api.db.services.department_service import DepartmentService
from api.db.services.feedback_service import (
    FeedbackService,
    FEEDBACK_IMAGE_BUCKET,
    FEEDBACK_MODULES,
)
from api.utils.api_utils import get_json_result
from common.constants import RetCode
from common.misc_utils import get_uuid
from common import settings

MAX_FEEDBACK_IMAGES = 5
MAX_FEEDBACK_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB per screenshot

# content-type -> extension for the stored object key.
_IMAGE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}


@manager.route("/feedback", methods=["POST"])  # noqa: F821
@login_required
async def submit_feedback():
    """Submit one piece of feedback. multipart/form-data:
    - content: required text
    - modules: JSON array string, subset of chat|knowledge|app
    - priority: 1-5 (defaults to 3)
    - images: 0-5 image files (each <= 5 MB)
    """
    try:
        form = await request.form
        content = (form.get("content") or "").strip()
        if not content:
            return get_json_result(message="Feedback content is required.", code=RetCode.ARGUMENT_ERROR)

        try:
            modules = json.loads(form.get("modules") or "[]")
        except Exception:
            modules = []
        modules = [m for m in modules if m in FEEDBACK_MODULES]

        try:
            priority = int(form.get("priority") or 3)
        except Exception:
            priority = 3
        priority = max(1, min(5, priority))

        files = await request.files
        image_files = files.getlist("images") if files else []
        image_files = [f for f in image_files if f and f.filename]
        if len(image_files) > MAX_FEEDBACK_IMAGES:
            return get_json_result(
                message=f"At most {MAX_FEEDBACK_IMAGES} images are allowed.",
                code=RetCode.ARGUMENT_ERROR,
            )

        image_keys = []
        for f in image_files:
            ctype = (f.content_type or "").lower()
            if not ctype.startswith("image/"):
                return get_json_result(message="Only image files are allowed.", code=RetCode.ARGUMENT_ERROR)
            f.seek(0, 2)
            size = f.tell()
            f.seek(0)
            if size > MAX_FEEDBACK_IMAGE_SIZE:
                return get_json_result(message="Image too large ( <= 5 MB ).", code=RetCode.ARGUMENT_ERROR)
            key = f"{get_uuid()}{_IMAGE_EXT.get(ctype, '.png')}"
            settings.STORAGE_IMPL.put(FEEDBACK_IMAGE_BUCKET, key, f.read())
            image_keys.append(key)

        department_id = getattr(current_user, "department_id", None)
        department_name = None
        if department_id:
            try:
                ok, dept = DepartmentService.get_by_id(department_id)
                if ok and dept:
                    department_name = dept.name
            except Exception as e:
                logging.warning(f"submit_feedback resolve department failed: {e}")

        FeedbackService.insert(
            id=get_uuid(),
            created_by=current_user.id,
            submitter_name=getattr(current_user, "nickname", None),
            submitter_email=getattr(current_user, "email", None),
            department_id=department_id,
            department_name=department_name,
            modules=modules,
            content=content,
            priority=priority,
            images=image_keys,
            status="open",
        )
        return get_json_result(data=True)
    except Exception as e:
        logging.exception(e)
        return get_json_result(message=str(e), code=RetCode.SERVER_ERROR)
