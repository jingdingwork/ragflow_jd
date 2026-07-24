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

import asyncio
import json
import os
import logging
import re
from typing import Any

from werkzeug.security import check_password_hash
from common.constants import ActiveEnum
from api.db import TenantPermission
from api.db.services import UserService
from api.db.services.department_service import DepartmentService, fetch_keycloak_users
from api.db.services.department_llm_service import (
    fetch_models as fetch_department_models,
    save_department_config,
    get_department_config,
    list_department_configs,
    apply_department_models_to_user,
    get_models_by_tenants,
    get_configured_department_ids,
    get_user_llm_config,
    save_user_llm_config,
    resync_department_models,
    resync_all_department_models,
)
from api.db.services.global_llm_service import (
    fetch_models as fetch_global_models,
    get_global_config,
    save_global_config,
    apply_global_models_to_user,
)
from api.db.services.model_catalog_service import (
    list_models as list_catalog_models,
    create_model as create_catalog_model,
    update_model as update_catalog_model,
    delete_model as delete_catalog_model,
    sync_from_configured_models as sync_catalog_models,
)
from api.db.joint_services.user_account_service import create_new_user, delete_user_data
from api.db.services.canvas_service import UserCanvasService
from api.db.services.user_service import TenantService, UserTenantService
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.document_service import DocumentService
from api.db.services.system_settings_service import SystemSettingsService
from api.db.services.api_service import APITokenService, API4ConversationService
from api.db.services.conversation_service import ConversationService
from api.db.services.application_service import (
    ApplicationService,
    ApplicationVersionService,
    ApplicationVisibilityService,
    get_visibility_department_ids,
    list_versions as list_app_versions,
    APP_PACKAGE_BUCKET,
)
from api.db.db_models import APIToken, DB, Conversation, API4Conversation, Dialog, UserCanvas
from common.constants import StatusEnum
from common.doc_store.doc_store_base import OrderByExpr
from common.misc_utils import get_uuid
from common import settings
from rag.nlp import search
from common.time_utils import current_timestamp
from datetime import datetime, timedelta
from api.utils.crypt import decrypt
from api.utils import health_utils

from api.common.exceptions import AdminException, UserAlreadyExistsError, UserNotFoundError
from config import SERVICE_CONFIGS


class UserMgr:
    @staticmethod
    def get_all_users():
        users = UserService.get_all_users()
        result = []
        for user in users:
            result.append(
                {
                    "email": user.email,
                    "nickname": user.nickname,
                    "create_date": user.create_date,
                    "is_active": user.is_active,
                    "is_superuser": user.is_superuser,
                    "is_departed": getattr(user, "is_departed", False),
                }
            )
        return result

    @staticmethod
    def get_user_details(username):
        # use email to query
        users = UserService.query_user_by_email(username)
        result = []
        for user in users:
            result.append(
                {
                    "avatar": user.avatar,
                    "email": user.email,
                    "language": user.language,
                    "last_login_time": user.last_login_time,
                    "is_active": user.is_active,
                    "is_anonymous": user.is_anonymous,
                    "login_channel": user.login_channel,
                    "status": user.status,
                    "is_superuser": user.is_superuser,
                    "is_departed": getattr(user, "is_departed", False),
                    "create_date": user.create_date,
                    "update_date": user.update_date,
                }
            )
        return result

    @staticmethod
    def create_user(username, password, role="user") -> dict:
        # Validate the email address
        if not re.match(r"^[\w\._-]+@([\w_-]+\.)+[\w-]{2,}$", username):
            raise AdminException(f"Invalid email address: {username}!")
        # Check if the email address is already used
        if UserService.query(email=username):
            raise UserAlreadyExistsError(username)
        # Construct user info data
        user_info_dict = {
            "email": username,
            "nickname": "",  # ask user to edit it manually in settings.
            "password": decrypt(password),
            "login_channel": "password",
            "is_superuser": role == "admin",
        }
        return create_new_user(user_info_dict)

    @staticmethod
    def set_dept_admin(email, is_admin):
        """Grant or revoke the department-admin flag for a user (by email)."""
        users = UserService.query(email=email)
        if not users:
            raise UserNotFoundError(email)
        user = users[0]
        UserService.update_user(user.id, {"is_dept_admin": bool(is_admin)})
        return {"email": user.email, "is_dept_admin": bool(is_admin)}

    @staticmethod
    def impersonate_user(email):
        """
        Produce login credentials for an existing user so a superuser can sign in
        as them for troubleshooting. Reuses the user's existing access_token (does
        NOT rotate it, so the user's own session is untouched).
        """
        users = UserService.query(email=email)
        if not users:
            raise UserNotFoundError(email)
        user = users[0]
        if user.is_active == ActiveEnum.INACTIVE.value:
            raise AdminException(f"User {email} inactive", 403)
        # If the user has no usable session token (never logged in, or logged out),
        # mint a fresh one so impersonation works. This rotates the token, so the
        # user's own active session (if any) would need to re-login.
        if not user.access_token or str(user.access_token).startswith("INVALID_"):
            from common.misc_utils import get_uuid

            user.access_token = get_uuid()
            user.save()
        return {
            "auth": user.get_id(),
            "email": user.email,
            "nickname": user.nickname,
        }

    @staticmethod
    def delete_user(username):
        # use email to delete
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        if len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        usr = user_list[0]
        return delete_user_data(usr.id)

    @staticmethod
    def update_user_password(username, new_password) -> str:
        # use email to find user. check exist and unique.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        # check new_password different from old.
        usr = user_list[0]
        psw = decrypt(new_password)
        if check_password_hash(usr.password, psw):
            return "Same password, no need to update!"
        # update password
        UserService.update_user_password(usr.id, psw)
        return "Password updated successfully!"

    @staticmethod
    def update_user_activate_status(username, activate_status: str):
        # use email to find user. check exist and unique.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        # check activate status different from new
        usr = user_list[0]
        if getattr(usr, "is_departed", False):
            raise AdminException(f"User {username} has departed and cannot change activation status.", 400)
        # format activate_status before handle
        _activate_status = activate_status.lower()
        target_status = {
            "on": ActiveEnum.ACTIVE.value,
            "off": ActiveEnum.INACTIVE.value,
        }.get(_activate_status)
        if not target_status:
            raise AdminException(f"Invalid activate_status: {activate_status}")
        if target_status == usr.is_active:
            return f"User activate status is already {_activate_status}!"
        # update is_active
        UserService.update_user(usr.id, {"is_active": target_status})
        return f"Turn {_activate_status} user activate status successfully!"

    @staticmethod
    def get_user_api_key(username: str) -> list[dict[str, Any]]:
        # use email to find user. check exist and unique.
        user_list: list[Any] = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"More than one user with username '{username}' found!")

        usr: Any = user_list[0]
        # tenant_id is typically the same as user_id for the owner tenant
        tenant_id: str = usr.id

        # Query all API keys for this tenant
        api_keys: Any = APITokenService.query(tenant_id=tenant_id)

        result: list[dict[str, Any]] = []
        for key in api_keys:
            result.append(key.to_dict())

        return result

    @staticmethod
    def save_api_key(api_key: dict[str, Any]) -> bool:
        return APITokenService.save(**api_key)

    @staticmethod
    def delete_api_key(username: str, key: str) -> bool:
        # use email to find user. check exist and unique.
        user_list: list[Any] = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")

        usr: Any = user_list[0]
        # tenant_id is typically the same as user_id for the owner tenant
        tenant_id: str = usr.id

        # Delete the API key
        deleted_count: int = APITokenService.filter_delete([APIToken.tenant_id == tenant_id, APIToken.token == key])
        return deleted_count > 0

    @staticmethod
    def grant_admin(username: str):
        # use email to find user. check exist and unique.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")

        # check activate status different from new
        usr = user_list[0]
        if usr.is_superuser:
            return f"{usr} is already superuser!"
        # update is_active
        UserService.update_user(usr.id, {"is_superuser": True})
        return "Grant successfully!"

    @staticmethod
    def revoke_admin(username: str):
        # use email to find user. check exist and unique.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        # check activate status different from new
        usr = user_list[0]
        if not usr.is_superuser:
            return f"{usr} isn't superuser, yet!"
        # update is_active
        UserService.update_user(usr.id, {"is_superuser": False})
        return "Revoke successfully!"


class DepartmentMgr:
    @staticmethod
    def get_department_tree():
        """
        Build the department tree from the department table and attach the
        users belonging to each department. Departments are sourced from OIDC
        LDAP DNs and refreshed on every user login.
        """
        departments = DepartmentService.get_all()
        users = UserService.get_all_users()
        models_by_tenant = get_models_by_tenants()
        configured_dept_ids = get_configured_department_ids()

        node_map = {}
        for d in departments:
            node_map[d.id] = {
                "id": d.id,
                "name": d.name,
                "parent_id": d.parent_id,
                "path_key": d.path_key,
                "llm_configured": d.id in configured_dept_ids,
                "children": [],
                "members": [],
                "member_count": 0,
            }

        for user in users:
            dept_id = getattr(user, "department_id", None)
            if dept_id and dept_id in node_map:
                node_map[dept_id]["members"].append(
                    {
                        "email": user.email,
                        "nickname": user.nickname,
                        "avatar": user.avatar,
                        "is_active": user.is_active,
                        "is_superuser": user.is_superuser,
                        "is_dept_admin": getattr(user, "is_dept_admin", False),
                        "username": getattr(user, "username", None),
                        "is_departed": getattr(user, "is_departed", False),
                        "last_login_time": user.last_login_time,
                        "models": models_by_tenant.get(user.id, []),
                    }
                )

        # Link children to parents; collect roots
        roots = []
        for node in node_map.values():
            parent_id = node["parent_id"]
            if parent_id and parent_id in node_map:
                node_map[parent_id]["children"].append(node)
            else:
                roots.append(node)

        # member_count = direct members + all descendants' members
        def count_members(node):
            total = len(node["members"])
            for child in node["children"]:
                total += count_members(child)
            node["member_count"] = total
            return total

        def sort_node(node):
            node["children"].sort(key=lambda c: c["name"])
            node["members"].sort(key=lambda m: m["nickname"] or m["email"])
            for child in node["children"]:
                sort_node(child)

        for root in roots:
            count_members(root)
            sort_node(root)
        roots.sort(key=lambda n: n["name"])

        return roots

    @staticmethod
    def sync_all_from_keycloak():
        """
        Pull every realm user from the Keycloak Admin API, upsert their departments,
        and ensure a local RAGFlow account exists with the correct department_id:

        - existing local user -> refresh department_id
        - missing local user  -> provision a full account (OIDC login channel)

        Matching is by email (case-insensitive). Covers users who never logged in.
        """
        directory, all_emails = fetch_keycloak_users()

        users = UserService.get_all_users()
        existing = {(u.email or "").strip().lower(): u for u in users}

        stats = {
            "keycloak_users": len(directory),
            "local_users": len(users),
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "no_ou": 0,
            "failed": 0,
            "departed": 0,
            "rejoined": 0,
        }

        for email_lower, info in directory.items():
            # Isolate each user so one failure can't abort the whole sync run
            # (which would silently leave every later user un-synced).
            try:
                dept_id = DepartmentService.upsert_from_dn(info["dn"])
                if not dept_id:
                    stats["no_ou"] += 1
                    continue

                user = existing.get(email_lower)
                if user is None:
                    try:
                        res = create_new_user(
                            {
                                "email": info["email"],
                                "nickname": info["nickname"],
                                "username": info.get("username"),
                                "login_channel": "oidc",
                                "is_superuser": False,
                                "department_id": dept_id,
                            }
                        )
                        if res.get("success"):
                            stats["created"] += 1
                            new_id = (res.get("user_info") or {}).get("id")
                            if new_id:
                                apply_department_models_to_user(new_id, dept_id)
                                apply_global_models_to_user(new_id)
                        else:
                            stats["failed"] += 1
                    except Exception:
                        logging.exception(f"Failed to create account for {info['email']}")
                        stats["failed"] += 1
                    continue

                new_username = info.get("username")
                patch = {}
                if getattr(user, "department_id", None) != dept_id:
                    patch["department_id"] = dept_id
                if new_username and getattr(user, "username", None) != new_username:
                    patch["username"] = new_username
                # Rejoin: a previously departed user is back in the directory
                if getattr(user, "is_departed", False):
                    patch["is_departed"] = False
                    patch["is_active"] = ActiveEnum.ACTIVE.value
                    stats["rejoined"] += 1
                if patch:
                    UserService.update_user(user.id, patch)
                    stats["updated"] += 1
                else:
                    stats["unchanged"] += 1
                apply_department_models_to_user(user.id, dept_id)
                apply_global_models_to_user(user.id)
            except Exception:
                logging.exception(f"Failed to sync user {info.get('email')}")
                stats["failed"] += 1

        # Departed reconciliation: OIDC accounts that no longer exist anywhere in
        # Keycloak are marked departed (terminal: also deactivated). Password
        # accounts and superusers are never auto-departed.
        for user in users:
            try:
                if getattr(user, "login_channel", None) != "oidc":
                    continue
                if getattr(user, "is_superuser", False):
                    continue
                if getattr(user, "is_departed", False):
                    continue
                if (user.email or "").strip().lower() in all_emails:
                    continue
                UserService.update_user(
                    user.id,
                    {"is_departed": True, "is_active": ActiveEnum.INACTIVE.value},
                )
                stats["departed"] += 1
            except Exception:
                logging.exception(f"Failed to mark departed user {getattr(user, 'email', None)}")
                stats["failed"] += 1

        return stats

    @staticmethod
    def fetch_models(api_base, api_key):
        return fetch_department_models(api_base, api_key)

    @staticmethod
    def get_llm_config(department_id):
        return get_department_config(department_id)

    @staticmethod
    def list_llm_configs():
        return list_department_configs()

    @staticmethod
    def save_llm_config(department_id, api_base, api_key, models):
        return save_department_config(department_id, api_base, api_key, models)

    @staticmethod
    def get_user_llm(email):
        return get_user_llm_config(email)

    @staticmethod
    def save_user_llm(email, models):
        return save_user_llm_config(email, models)

    @staticmethod
    def resync_llm_models(department_id):
        return resync_department_models(department_id)

    @staticmethod
    def resync_all_llm_models():
        return resync_all_department_models()

    @staticmethod
    def export_members():
        """
        Export all department members as an .xlsx workbook (bytes), sorted by
        department. Columns: 工号 (username) | 邮箱 (email) | 姓名 (nickname) |
        部门名称 (full OU path). Only users with a resolved department are included.
        """
        import io
        from openpyxl import Workbook

        path_by_id = {d.id: d.path_key for d in DepartmentService.get_all()}
        rows = []
        for user in UserService.get_all_users():
            dept_id = getattr(user, "department_id", None)
            if not dept_id or dept_id not in path_by_id:
                continue
            dept_name = path_by_id[dept_id]
            rows.append(
                {
                    "username": getattr(user, "username", None) or "",
                    "email": user.email or "",
                    "nickname": user.nickname or "",
                    "department": dept_name or "",
                }
            )
        rows.sort(key=lambda r: (r["department"], r["nickname"] or r["email"]))

        wb = Workbook()
        ws = wb.active
        ws.title = "Departments"
        ws.append(["工号", "邮箱", "姓名", "部门名称"])
        for r in rows:
            ws.append([r["username"], r["email"], r["nickname"], r["department"]])

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()


class ModelCatalogMgr:
    """Admin-curated model catalog shown to end users (name + capability/custom tags)."""

    @staticmethod
    def list_models():
        return list_catalog_models()

    @staticmethod
    def create_model(llm_name, capabilities, custom_tags):
        return create_catalog_model(llm_name, capabilities, custom_tags)

    @staticmethod
    def update_model(catalog_id, llm_name, capabilities, custom_tags):
        return update_catalog_model(catalog_id, llm_name, capabilities, custom_tags)

    @staticmethod
    def delete_model(catalog_id):
        return delete_catalog_model(catalog_id)

    @staticmethod
    def sync_models():
        return sync_catalog_models()


class GlobalLLMMgr:
    """Global "other models" config: one provider + one model per auxiliary type,
    applied to every user's tenant defaults."""

    @staticmethod
    def fetch_models(api_base, api_key):
        return fetch_global_models(api_base, api_key)

    @staticmethod
    def get_config():
        return get_global_config()

    @staticmethod
    def save_config(api_base, api_key, models):
        return save_global_config(api_base, api_key, models)


class ChatHistoryMgr:
    """
    Read-only audit views over chat history for the admin console.

    Two sources are merged:
      - Conversation       -> source='chat'  (web chat assistant sessions)
      - API4Conversation   -> source='agent' (agent / API channel sessions)

    A "session" is one conversation row; a "round" is one user turn that was
    answered. Sessions are bucketed by their create_time (millisecond epoch).
    """

    @staticmethod
    def _now_boundaries():
        now = datetime.now()
        today_start = datetime(now.year, now.month, now.day)
        week_start = today_start - timedelta(days=today_start.weekday())
        return int(today_start.timestamp() * 1000), int(week_start.timestamp() * 1000)

    @staticmethod
    def _round_count(message, round_field=None):
        if round_field:
            return int(round_field)
        if not message:
            return 0
        return sum(1 for m in message if isinstance(m, dict) and m.get("role") == "user")

    @staticmethod
    def _message_count(message):
        return len(message) if isinstance(message, list) else 0

    @staticmethod
    def get_stats():
        today_ms, week_ms = ChatHistoryMgr._now_boundaries()
        stats = {
            "today_sessions": 0,
            "today_rounds": 0,
            "week_sessions": 0,
            "week_rounds": 0,
        }

        def accumulate(create_time, rounds):
            ct = create_time or 0
            stats["week_sessions"] += 1
            stats["week_rounds"] += rounds
            if ct >= today_ms:
                stats["today_sessions"] += 1
                stats["today_rounds"] += rounds

        with DB.connection_context():
            for row in (
                Conversation.select(Conversation.create_time, Conversation.message)
                .where(Conversation.create_time >= week_ms)
                .dicts()
            ):
                accumulate(row.get("create_time"), ChatHistoryMgr._round_count(row.get("message")))

            for row in (
                API4Conversation.select(
                    API4Conversation.create_time,
                    API4Conversation.round,
                    API4Conversation.message,
                )
                .where(API4Conversation.create_time >= week_ms)
                .dicts()
            ):
                accumulate(
                    row.get("create_time"),
                    ChatHistoryMgr._round_count(row.get("message"), row.get("round")),
                )

        return stats

    @staticmethod
    def _user_index():
        index = {}
        for user in UserService.get_all_users():
            index[user.id] = {
                "email": user.email,
                "nickname": user.nickname,
                "avatar": user.avatar,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "is_dept_admin": getattr(user, "is_dept_admin", False),
                "department_id": getattr(user, "department_id", None),
            }
        return index

    @staticmethod
    def get_overview(start_ms=0, end_ms=None):
        if not end_ms:
            end_ms = current_timestamp()
        start_ms = start_ms or 0

        counts = {}  # user_id -> [sessions, rounds]

        def add(uid, rounds):
            if not uid:
                return
            bucket = counts.setdefault(uid, [0, 0])
            bucket[0] += 1
            bucket[1] += rounds

        with DB.connection_context():
            for row in (
                Conversation.select(Conversation.user_id, Conversation.message)
                .where(
                    (Conversation.create_time >= start_ms)
                    & (Conversation.create_time <= end_ms)
                )
                .dicts()
            ):
                add(row.get("user_id"), ChatHistoryMgr._round_count(row.get("message")))

            for row in (
                API4Conversation.select(
                    API4Conversation.user_id,
                    API4Conversation.round,
                    API4Conversation.message,
                )
                .where(
                    (API4Conversation.create_time >= start_ms)
                    & (API4Conversation.create_time <= end_ms)
                )
                .dicts()
            ):
                add(
                    row.get("user_id"),
                    ChatHistoryMgr._round_count(row.get("message"), row.get("round")),
                )

        departments = DepartmentService.get_all()
        users = UserService.get_all_users()

        node_map = {}
        for d in departments:
            node_map[d.id] = {
                "id": d.id,
                "name": d.name,
                "parent_id": d.parent_id,
                "children": [],
                "members": [],
                "member_count": 0,
                "session_count": 0,
                "round_count": 0,
            }

        for user in users:
            dept_id = getattr(user, "department_id", None)
            if dept_id and dept_id in node_map:
                sessions, rounds = counts.get(user.id, [0, 0])
                node_map[dept_id]["members"].append(
                    {
                        "user_id": user.id,
                        "email": user.email,
                        "nickname": user.nickname,
                        "is_active": user.is_active,
                        "is_superuser": user.is_superuser,
                        "is_dept_admin": getattr(user, "is_dept_admin", False),
                        "session_count": sessions,
                        "round_count": rounds,
                    }
                )

        roots = []
        for node in node_map.values():
            parent_id = node["parent_id"]
            if parent_id and parent_id in node_map:
                node_map[parent_id]["children"].append(node)
            else:
                roots.append(node)

        def roll_up(node):
            sessions = sum(m["session_count"] for m in node["members"])
            rounds = sum(m["round_count"] for m in node["members"])
            members = len(node["members"])
            for child in node["children"]:
                c_sessions, c_rounds, c_members = roll_up(child)
                sessions += c_sessions
                rounds += c_rounds
                members += c_members
            node["session_count"] = sessions
            node["round_count"] = rounds
            node["member_count"] = members
            return sessions, rounds, members

        def sort_node(node):
            node["children"].sort(key=lambda c: c["name"])
            node["members"].sort(key=lambda m: (-m["session_count"], m["nickname"] or m["email"]))
            for child in node["children"]:
                sort_node(child)

        for root in roots:
            roll_up(root)
            sort_node(root)
        roots.sort(key=lambda n: n["name"])

        return roots

    @staticmethod
    def _resolve_app_names(dialog_ids):
        names = {}
        ids = [i for i in dialog_ids if i]
        if not ids:
            return names
        for row in Dialog.select(Dialog.id, Dialog.name).where(Dialog.id.in_(ids)).dicts():
            names[row["id"]] = row["name"]
        missing = [i for i in ids if i not in names]
        if missing:
            for row in (
                UserCanvas.select(UserCanvas.id, UserCanvas.title)
                .where(UserCanvas.id.in_(missing))
                .dicts()
            ):
                names[row["id"]] = row["title"]
        return names

    @staticmethod
    def list_user_conversations(user_id, start_ms=0, end_ms=None, page=1, size=20):
        if not end_ms:
            end_ms = current_timestamp()
        start_ms = start_ms or 0

        items = []
        with DB.connection_context():
            for row in (
                Conversation.select(
                    Conversation.id,
                    Conversation.name,
                    Conversation.dialog_id,
                    Conversation.message,
                    Conversation.create_time,
                    Conversation.create_date,
                )
                .where(
                    (Conversation.user_id == user_id)
                    & (Conversation.create_time >= start_ms)
                    & (Conversation.create_time <= end_ms)
                )
                .dicts()
            ):
                items.append(
                    {
                        "id": row["id"],
                        "source": "chat",
                        "name": row.get("name"),
                        "dialog_id": row.get("dialog_id"),
                        "create_time": row.get("create_time"),
                        "create_date": str(row.get("create_date")) if row.get("create_date") else None,
                        "round_count": ChatHistoryMgr._round_count(row.get("message")),
                        "msg_count": ChatHistoryMgr._message_count(row.get("message")),
                    }
                )

            for row in (
                API4Conversation.select(
                    API4Conversation.id,
                    API4Conversation.name,
                    API4Conversation.dialog_id,
                    API4Conversation.message,
                    API4Conversation.round,
                    API4Conversation.create_time,
                    API4Conversation.create_date,
                )
                .where(
                    (API4Conversation.user_id == user_id)
                    & (API4Conversation.create_time >= start_ms)
                    & (API4Conversation.create_time <= end_ms)
                )
                .dicts()
            ):
                items.append(
                    {
                        "id": row["id"],
                        "source": "agent",
                        "name": row.get("name"),
                        "dialog_id": row.get("dialog_id"),
                        "create_time": row.get("create_time"),
                        "create_date": str(row.get("create_date")) if row.get("create_date") else None,
                        "round_count": ChatHistoryMgr._round_count(row.get("message"), row.get("round")),
                        "msg_count": ChatHistoryMgr._message_count(row.get("message")),
                    }
                )

            app_names = ChatHistoryMgr._resolve_app_names([i["dialog_id"] for i in items])

        for item in items:
            item["app_name"] = app_names.get(item["dialog_id"]) or "-"

        items.sort(key=lambda i: i.get("create_time") or 0, reverse=True)

        total = len(items)
        page = max(int(page), 1)
        size = max(int(size), 1)
        start = (page - 1) * size
        return {"total": total, "page": page, "size": size, "items": items[start : start + size]}

    @staticmethod
    def get_conversation_detail(conversation_id, source="chat"):
        with DB.connection_context():
            if source == "agent":
                ok, conv = API4ConversationService.get_by_id(conversation_id)
            else:
                ok, conv = ConversationService.get_by_id(conversation_id)
            if not ok or conv is None:
                raise AdminException("Conversation not found", 404)
            data = conv.to_dict()
            app_names = ChatHistoryMgr._resolve_app_names([data.get("dialog_id")])

        raw_messages = data.get("message") or []
        messages = []
        for m in raw_messages:
            if not isinstance(m, dict):
                continue
            messages.append(
                {
                    "role": m.get("role", ""),
                    "content": m.get("content", ""),
                    "created_at": m.get("created_at"),
                }
            )

        user_id = data.get("user_id")
        user_info = ChatHistoryMgr._user_index().get(user_id, {})
        return {
            "id": data.get("id"),
            "source": source,
            "name": data.get("name"),
            "app_name": app_names.get(data.get("dialog_id")) or "-",
            "user_id": user_id,
            "user_nickname": user_info.get("nickname"),
            "user_email": user_info.get("email"),
            "create_date": str(data.get("create_date")) if data.get("create_date") else None,
            "messages": messages,
        }


class ApplicationMgr:
    """Admin-side management of the application portal: applications, their
    installation-package versions, and per-department visibility."""

    ALLOWED_EXTENSIONS = {".exe", ".msi", ".zip"}

    @staticmethod
    def _version_to_dict(v):
        return {
            "id": v.id,
            "application_id": v.application_id,
            "version": v.version,
            "description": v.description,
            "file_name": v.file_name,
            "file_size": v.file_size,
            "is_latest": bool(v.is_latest),
            "create_date": str(v.create_date) if v.create_date else None,
        }

    @classmethod
    def _app_to_dict(cls, app, with_detail=False):
        data = {
            "id": app.id,
            "name": app.name,
            "description": app.description,
            "icon": app.icon,
            "app_type": app.app_type,
            "url": app.url,
            "visibility": app.visibility,
            "sort": app.sort,
            "status": app.status,
            "create_date": str(app.create_date) if app.create_date else None,
        }
        versions = list_app_versions(app.id)
        data["version_count"] = len(versions)
        latest = next((v for v in versions if v.is_latest), versions[0] if versions else None)
        data["latest_version"] = latest.version if latest else None
        if with_detail:
            data["versions"] = [cls._version_to_dict(v) for v in versions]
            data["department_ids"] = get_visibility_department_ids(app.id)
        return data

    @classmethod
    def list_applications(cls):
        apps = list(ApplicationService.get_all())
        apps.sort(key=lambda a: (a.sort or 0, -(a.create_time or 0)))
        return [cls._app_to_dict(a) for a in apps]

    @classmethod
    def get_application(cls, application_id):
        app = ApplicationService.get_or_none(id=application_id)
        if not app:
            raise AdminException("Application not found", 404)
        return cls._app_to_dict(app, with_detail=True)

    @classmethod
    def _save_visibility(cls, application_id, department_ids):
        ApplicationVisibilityService.filter_delete(
            [ApplicationVisibilityService.model.application_id == application_id]
        )
        for dept_id in set(department_ids or []):
            if not dept_id:
                continue
            ApplicationVisibilityService.insert(
                id=get_uuid(),
                application_id=application_id,
                department_id=dept_id,
                status=StatusEnum.VALID.value,
            )

    @classmethod
    def create_application(cls, data):
        name = (data.get("name") or "").strip()
        if not name:
            raise AdminException("Application name is required", 400)
        app_type = data.get("app_type", "web")
        if app_type not in ("web", "exe"):
            raise AdminException("Invalid app_type", 400)
        visibility = data.get("visibility", "dept")
        if visibility not in ("all", "dept"):
            raise AdminException("Invalid visibility", 400)

        app_id = get_uuid()
        ApplicationService.insert(
            id=app_id,
            name=name,
            description=data.get("description") or "",
            icon=data.get("icon") or "",
            app_type=app_type,
            url=(data.get("url") or "").strip(),
            visibility=visibility,
            sort=int(data.get("sort", 0) or 0),
            status=StatusEnum.VALID.value,
        )
        if visibility == "dept":
            cls._save_visibility(app_id, data.get("department_ids", []))
        return cls.get_application(app_id)

    @classmethod
    def update_application(cls, application_id, data):
        app = ApplicationService.get_or_none(id=application_id)
        if not app:
            raise AdminException("Application not found", 404)

        patch = {}
        for field in ("name", "description", "icon", "url"):
            if field in data:
                patch[field] = (data.get(field) or "").strip() if field in ("name", "url") else (data.get(field) or "")
        if "name" in patch and not patch["name"]:
            raise AdminException("Application name is required", 400)
        if "app_type" in data:
            if data["app_type"] not in ("web", "exe"):
                raise AdminException("Invalid app_type", 400)
            patch["app_type"] = data["app_type"]
        if "visibility" in data:
            if data["visibility"] not in ("all", "dept"):
                raise AdminException("Invalid visibility", 400)
            patch["visibility"] = data["visibility"]
        if "sort" in data:
            patch["sort"] = int(data.get("sort", 0) or 0)
        if "status" in data:
            patch["status"] = str(data["status"])
        if patch:
            ApplicationService.update_by_id(application_id, patch)

        if "department_ids" in data:
            cls._save_visibility(application_id, data.get("department_ids", []))
        return cls.get_application(application_id)

    @classmethod
    def delete_application(cls, application_id):
        app = ApplicationService.get_or_none(id=application_id)
        if not app:
            raise AdminException("Application not found", 404)
        # Remove packages from storage, then version/visibility rows, then the app.
        for v in list_app_versions(application_id):
            if v.file_key:
                try:
                    settings.STORAGE_IMPL.rm(APP_PACKAGE_BUCKET, v.file_key)
                except Exception:
                    logging.exception(f"Failed to remove package {v.file_key}")
        ApplicationVersionService.filter_delete(
            [ApplicationVersionService.model.application_id == application_id]
        )
        ApplicationVisibilityService.filter_delete(
            [ApplicationVisibilityService.model.application_id == application_id]
        )
        ApplicationService.delete_by_id(application_id)
        return {"deleted": True}

    @classmethod
    def add_version(cls, application_id, version, description, file_name, binary):
        app = ApplicationService.get_or_none(id=application_id)
        if not app:
            raise AdminException("Application not found", 404)
        version = (version or "").strip()
        if not version:
            raise AdminException("Version is required", 400)
        file_name = (file_name or "").strip()
        if not file_name or not binary:
            raise AdminException("Installation package is required", 400)
        ext = os.path.splitext(file_name)[1].lower()
        if ext not in cls.ALLOWED_EXTENSIONS:
            raise AdminException(
                f"Unsupported file type {ext}. Allowed: {', '.join(sorted(cls.ALLOWED_EXTENSIONS))}",
                400,
            )

        version_id = get_uuid()
        file_key = f"{application_id}/{version_id}/{file_name}"
        try:
            settings.STORAGE_IMPL.put(APP_PACKAGE_BUCKET, file_key, binary)
        except Exception:
            logging.exception(f"Failed to upload package {file_key}")
            raise AdminException("Failed to store installation package", 500)

        # New upload becomes the latest version.
        ApplicationVersionService.filter_update(
            [ApplicationVersionService.model.application_id == application_id],
            {"is_latest": False},
        )
        ApplicationVersionService.insert(
            id=version_id,
            application_id=application_id,
            version=version,
            description=description or "",
            file_key=file_key,
            file_name=file_name,
            file_size=len(binary),
            is_latest=True,
            status=StatusEnum.VALID.value,
        )
        return cls.get_application(application_id)

    @classmethod
    def delete_version(cls, application_id, version_id):
        v = ApplicationVersionService.get_or_none(id=version_id, application_id=application_id)
        if not v:
            raise AdminException("Version not found", 404)
        if v.file_key:
            try:
                settings.STORAGE_IMPL.rm(APP_PACKAGE_BUCKET, v.file_key)
            except Exception:
                logging.exception(f"Failed to remove package {v.file_key}")
        was_latest = bool(v.is_latest)
        ApplicationVersionService.delete_by_id(version_id)
        # Promote the newest remaining version if we removed the latest one.
        if was_latest:
            remaining = list_app_versions(application_id)
            if remaining:
                ApplicationVersionService.update_by_id(remaining[0].id, {"is_latest": True})
        return cls.get_application(application_id)

    @classmethod
    def set_latest_version(cls, application_id, version_id):
        v = ApplicationVersionService.get_or_none(id=version_id, application_id=application_id)
        if not v:
            raise AdminException("Version not found", 404)
        ApplicationVersionService.filter_update(
            [ApplicationVersionService.model.application_id == application_id],
            {"is_latest": False},
        )
        ApplicationVersionService.update_by_id(version_id, {"is_latest": True})
        return cls.get_application(application_id)


class EsDataMgr:
    """Read-only inspection of the document-store (ES/Infinity/...) data for a knowledge base.

    Nothing here mutates the index: only ``search`` / ``get`` / aggregation helpers are used.
    The document store is engine-agnostic via ``settings.docStoreConn``; an index is named
    per tenant (``ragflow_{tenant_id}``) and a KB's chunks are filtered by ``kb_id``.
    """

    # Heavy / noisy fields stripped from the raw chunk before returning it to the UI.
    _DROP_FIELD_RE = re.compile(r"(_vec$|_sm_|_tks$|_ltks$)")

    # Fields fetched for the chunk list view.
    LIST_FIELDS = [
        "docnm_kwd", "doc_id", "kb_id", "content_with_weight", "important_kwd",
        "question_kwd", "doc_type_kwd", "position_int", "page_num_int",
        "available_int", "img_id", "create_timestamp_flt",
    ]

    @staticmethod
    def _kb_or_raise(kb_id):
        ok, kb = KnowledgebaseService.get_by_id(kb_id)
        if not ok or not kb:
            raise AdminException("Knowledge base not found", 404)
        return kb

    @staticmethod
    def list_knowledgebases():
        """List every valid knowledge base in the system, with owner/department info for grouping."""
        model = KnowledgebaseService.model
        rows = (
            model.select(
                model.id, model.name, model.tenant_id, model.created_by,
                model.department_id, model.permission,
                model.doc_num, model.chunk_num, model.token_num,
                model.language, model.parser_id, model.create_date,
            )
            .where(model.status == StatusEnum.VALID.value)
            .order_by(model.create_time.desc())
        )
        kbs = list(rows.dicts())

        # Best-effort resolve creator nickname (batch).
        creator_ids = {k["created_by"] for k in kbs if k.get("created_by")}
        nick_map = {}
        if creator_ids:
            try:
                for u in UserService.model.select(
                    UserService.model.id, UserService.model.nickname
                ).where(UserService.model.id.in_(list(creator_ids))):
                    nick_map[u.id] = u.nickname
            except Exception as e:
                logging.warning(f"EsDataMgr.list_knowledgebases resolve nickname failed: {e}")

        # Best-effort resolve department name (batch).
        dept_ids = {k["department_id"] for k in kbs if k.get("department_id")}
        dept_map = {}
        if dept_ids:
            try:
                dmodel = DepartmentService.model
                for d in dmodel.select(dmodel.id, dmodel.name).where(dmodel.id.in_(list(dept_ids))):
                    dept_map[d.id] = d.name
            except Exception as e:
                logging.warning(f"EsDataMgr.list_knowledgebases resolve department failed: {e}")

        for k in kbs:
            k["creator_name"] = nick_map.get(k.get("created_by"), k.get("created_by"))
            k["department_name"] = dept_map.get(k.get("department_id")) if k.get("department_id") else None
            k["create_date"] = str(k["create_date"]) if k.get("create_date") else None
        return kbs

    @staticmethod
    def get_stats(kb_id):
        """Index health + chunk total + per-document chunk counts for one KB."""
        kb = EsDataMgr._kb_or_raise(kb_id)
        conn = settings.docStoreConn
        idx = search.index_name(kb.tenant_id)
        # index_exist may return a non-serializable HeadApiResponse; coerce to bool.
        exist = bool(conn.index_exist(idx, kb_id))

        es_total = 0
        doc_aggregation = []
        if exist:
            res = conn.search(
                [], [], {"kb_id": kb_id}, [], OrderByExpr(), 0, 0,
                idx, [kb_id], ["docnm_kwd"],
            )
            es_total = conn.get_total(res)
            doc_aggregation = [
                {"name": name, "count": count}
                for name, count in conn.get_aggregation(res, "docnm_kwd")
            ]

        health = {}
        try:
            health = conn.health()
        except Exception as e:
            logging.warning(f"EsDataMgr.get_stats health failed: {e}")

        return {
            "kb": {
                "id": kb.id, "name": kb.name, "tenant_id": kb.tenant_id,
                "doc_num": kb.doc_num, "chunk_num": kb.chunk_num, "token_num": kb.token_num,
            },
            "engine": conn.db_type(),
            "index_name": idx,
            "index_exist": exist,
            "es_total": es_total,
            "doc_aggregation": doc_aggregation,
            "health": health,
        }

    @staticmethod
    def list_documents(kb_id):
        """Document id/name list for the chunk filter dropdown."""
        EsDataMgr._kb_or_raise(kb_id)
        model = DocumentService.model
        rows = (
            model.select(model.id, model.name, model.chunk_num)
            .where(model.kb_id == kb_id)
            .order_by(model.create_time.desc())
        )
        return [{"id": r.id, "name": r.name, "chunk_num": r.chunk_num} for r in rows]

    @staticmethod
    def search_chunks(kb_id, question="", doc_id="", page=1, size=20, available=None):
        """Full-text search / browse chunks of a KB (read-only, no vector model needed)."""
        kb = EsDataMgr._kb_or_raise(kb_id)
        conn = settings.docStoreConn
        idx = search.index_name(kb.tenant_id)
        if not conn.index_exist(idx, kb_id):
            return {"total": 0, "chunks": []}

        query = {
            "page": page,
            "size": size,
            "question": question or "",
            "sort": True,
            "fields": EsDataMgr.LIST_FIELDS,
        }
        if doc_id:
            query["doc_ids"] = [doc_id]
        if available is not None:
            query["available_int"] = available

        # retriever.search is async; admin server is sync Flask -> drive it with asyncio.run.
        sres = asyncio.run(
            settings.retriever.search(
                query, idx, [kb_id], emb_mdl=None, highlight=bool(question)
            )
        )

        chunks = []
        for cid in sres.ids:
            f = sres.field.get(cid, {})
            highlighted = question and cid in sres.highlight
            chunks.append({
                "id": cid,
                "doc_id": f.get("doc_id", ""),
                "docnm_kwd": f.get("docnm_kwd", ""),
                "content": sres.highlight[cid] if highlighted else f.get("content_with_weight", ""),
                "highlighted": bool(highlighted),
                "important_kwd": f.get("important_kwd", []) if isinstance(f.get("important_kwd"), list) else ([f.get("important_kwd")] if f.get("important_kwd") else []),
                "question_kwd": f.get("question_kwd", []) if isinstance(f.get("question_kwd"), list) else ([f.get("question_kwd")] if f.get("question_kwd") else []),
                "doc_type_kwd": f.get("doc_type_kwd", ""),
                "available": bool(int(f.get("available_int", 1))),
                "positions": f.get("position_int", []),
                "img_id": f.get("img_id", ""),
                "score": f.get("_score"),
            })
        return {"total": sres.total, "chunks": chunks}

    @staticmethod
    def get_chunk(kb_id, chunk_id):
        """Full raw chunk for the detail view, minus heavy vector/token fields."""
        kb = EsDataMgr._kb_or_raise(kb_id)
        conn = settings.docStoreConn
        idx = search.index_name(kb.tenant_id)
        chunk = conn.get(chunk_id, idx, [kb_id])
        if not chunk:
            raise AdminException("Chunk not found", 404)
        cleaned = {
            k: v for k, v in chunk.items()
            if not EsDataMgr._DROP_FIELD_RE.search(k)
        }
        return cleaned


class KbPermissionMgr:
    """Company-wide visibility control for knowledge bases (admin console only).

    ``permission == 'company'`` makes a KB readable by every user regardless of
    department; it is the *only* write operation the admin console performs on a
    knowledge base, and the user-facing API refuses to set or clear it. Governance
    (upload/parse/edit/delete) is unaffected — it stays with the creator and the
    owning department's admin — so a company KB is read-only for everyone else.
    """

    @staticmethod
    def set_company_level(kb_id, enabled):
        """Promote a KB to company-wide, or demote it back to its own department.

        Demotion targets ``department`` when the KB carries a department, else the
        private ``me`` level — the original value is not journalled anywhere, and
        those two are the only levels the user-facing UI can produce.
        """
        ok, kb = KnowledgebaseService.get_by_id(kb_id)
        if not ok or not kb:
            raise AdminException("Knowledge base not found", 404)

        if enabled:
            permission = TenantPermission.COMPANY.value
        elif kb.department_id:
            permission = TenantPermission.DEPARTMENT.value
        else:
            permission = TenantPermission.ME.value

        if permission != kb.permission:
            KnowledgebaseService.update_by_id(kb_id, {"permission": permission})
        return {"id": kb_id, "name": kb.name, "permission": permission}


class RetrievalMgr:
    """Read-only retrieval & rerank preview for a knowledge base.

    Runs the SAME hybrid (full-text + dense vector) retrieval the main app uses
    (``settings.retriever.retrieval``), once WITHOUT a reranker and once WITH the
    tenant's default rerank model, so the two orderings can be compared side by
    side. Each chunk carries three scores: ``similarity`` (final, used for sort),
    ``vector_similarity`` (dense), ``term_similarity`` (keyword/BM25). Nothing is
    mutated; this only reads the document store and calls the embedding/rerank
    providers. Model-loading helpers are imported lazily to avoid any import-order
    coupling at module load time.
    """

    @staticmethod
    def _load_embedding(kb):
        from api.db.services.llm_service import LLMBundle
        from api.db.joint_services.tenant_model_service import (
            get_model_config_by_id,
            get_model_config_by_type_and_name,
        )
        from common.constants import LLMType

        if kb.tenant_embd_id:
            cfg = get_model_config_by_id(kb.tenant_embd_id)
        else:
            cfg = get_model_config_by_type_and_name(kb.tenant_id, LLMType.EMBEDDING, kb.embd_id)
        return LLMBundle(kb.tenant_id, cfg), cfg.get("llm_name", kb.embd_id)

    @staticmethod
    def _slim(ranks):
        """Trim a retrieval result down to what the comparison UI needs."""
        out = []
        for c in ranks.get("chunks", []):
            kwd = c.get("important_kwd", [])
            out.append({
                "chunk_id": c.get("chunk_id"),
                "doc_id": c.get("doc_id", ""),
                "docnm_kwd": c.get("docnm_kwd", ""),
                "content": c.get("highlight") or c.get("content_with_weight", ""),
                "similarity": round(float(c.get("similarity", 0.0) or 0.0), 4),
                "vector_similarity": round(float(c.get("vector_similarity", 0.0) or 0.0), 4),
                "term_similarity": round(float(c.get("term_similarity", 0.0) or 0.0), 4),
                "important_kwd": kwd if isinstance(kwd, list) else ([kwd] if kwd else []),
            })
        return {"total": ranks.get("total", 0), "chunks": out}

    @staticmethod
    def run(kb_id, question, doc_id="", top_k=1024, page_size=20,
            similarity_threshold=0.0, vector_similarity_weight=0.3):
        from api.db.services.llm_service import LLMBundle
        from api.db.joint_services.tenant_model_service import get_tenant_default_model_by_type
        from common.constants import LLMType, PAGERANK_FLD

        kb = EsDataMgr._kb_or_raise(kb_id)
        question = (question or "").strip()
        if not question:
            raise AdminException("Question is required", 400)

        embd_mdl, embd_name = RetrievalMgr._load_embedding(kb)
        tenant_ids = [kb.tenant_id]
        doc_ids = [doc_id] if doc_id else None
        rank_feature = {PAGERANK_FLD: 10}

        def _retrieve(rerank_mdl):
            # retriever.retrieval is async; admin is sync Flask -> drive with asyncio.run.
            return asyncio.run(settings.retriever.retrieval(
                question, embd_mdl, tenant_ids, [kb_id],
                1, page_size, similarity_threshold, vector_similarity_weight,
                top_k, doc_ids, aggs=False, rerank_mdl=rerank_mdl,
                highlight=True, rank_feature=rank_feature,
            ))

        # Baseline: hybrid retrieval, no external reranker.
        base = RetrievalMgr._slim(_retrieve(None))

        # With the tenant's default rerank model (best-effort: may be unset/unavailable).
        rerank_name = None
        rerank_available = False
        rerank_error = None
        reranked = None
        try:
            rcfg = get_tenant_default_model_by_type(kb.tenant_id, LLMType.RERANK)
            rerank_name = rcfg.get("llm_name")
            rerank_mdl = LLMBundle(kb.tenant_id, rcfg)
            reranked = RetrievalMgr._slim(_retrieve(rerank_mdl))
            rerank_available = True
        except Exception as e:
            rerank_error = str(e)
            logging.warning(f"RetrievalMgr.run rerank unavailable for kb={kb_id}: {e}")

        return {
            "kb": {"id": kb.id, "name": kb.name},
            "embedding_model": embd_name,
            "rerank_model": rerank_name,
            "rerank_available": rerank_available,
            "rerank_error": rerank_error,
            "vector_similarity_weight": vector_similarity_weight,
            "similarity_threshold": similarity_threshold,
            "question": question,
            "base": base,
            "reranked": reranked,
        }


class PromptMgr:
    """Admin CRUD over the chat prompt template library (default + per-department)."""

    @staticmethod
    def list_all():
        from api.db.services.prompt_template_service import PromptTemplateService
        return PromptTemplateService.list_all()

    @staticmethod
    def create(data):
        from api.db.services.prompt_template_service import PromptTemplateService
        tid = PromptTemplateService.create_template(
            name=data.get("name", ""),
            scope=data.get("scope", "department"),
            department_id=data.get("department_id") or None,
            system=data.get("system", ""),
            prologue=data.get("prologue", ""),
            is_default=bool(data.get("is_default", False)),
            sort=data.get("sort", 0),
        )
        return {"id": tid}

    @staticmethod
    def update(template_id, data):
        from api.db.services.prompt_template_service import PromptTemplateService
        PromptTemplateService.update_template(template_id, **data)
        return {"id": template_id}

    @staticmethod
    def delete(template_id):
        from api.db.services.prompt_template_service import PromptTemplateService
        PromptTemplateService.delete_template(template_id)
        return {"id": template_id}


class FolderMgr:
    """Admin management of department shared-folder data sources (mounted SMB/NFS).

    Each binding is a department-scoped ``local_folder`` Connector linked to one
    KB via Connector2Kb. The sync worker (rag/svr/sync_data_source.py) performs
    the incremental + delete-reconciling sync; here we only do CRUD and trigger
    manual syncs.
    """

    SOURCE = "local_folder"

    @staticmethod
    def _conn_services():
        from api.db.services.connector_service import (
            ConnectorService,
            Connector2KbService,
            SyncLogsService,
        )
        return ConnectorService, Connector2KbService, SyncLogsService

    @staticmethod
    def _build_config(data):
        root_path = (data.get("root_path") or "").strip()
        if not root_path:
            raise ValueError("root_path is required.")
        exclude = data.get("exclude_dirs")
        if isinstance(exclude, str):
            exclude = [x.strip() for x in exclude.split(",") if x.strip()]
        return {
            "root_path": root_path,
            "recursive": bool(data.get("recursive", True)),
            "allow_images": bool(data.get("allow_images", False)),
            "sync_deleted_files": bool(data.get("sync_deleted_files", True)),
            "exclude_dirs": exclude or [],
        }

    @staticmethod
    def test(data):
        """Detection button: check the mounted folder is reachable (no persistence)."""
        from common.data_source.local_folder_connector import LocalFolderConnector

        cfg = FolderMgr._build_config(data)
        connector = LocalFolderConnector(
            root_path=cfg["root_path"],
            recursive=cfg["recursive"],
            exclude_dirs=cfg["exclude_dirs"],
        )
        connector.set_allow_images(cfg["allow_images"])
        connector.validate_connector_settings()
        return {"accessible": True, "file_count": connector.count_supported_files()}

    @staticmethod
    def list_all():
        ConnectorService, Connector2KbService, SyncLogsService = FolderMgr._conn_services()
        model = ConnectorService.model
        conns = list(model.select().where(model.source == FolderMgr.SOURCE))

        dept_ids = {c.department_id for c in conns if c.department_id}
        dept_map = {}
        if dept_ids:
            dmodel = DepartmentService.model
            for d in dmodel.select(dmodel.id, dmodel.name).where(dmodel.id.in_(list(dept_ids))):
                dept_map[d.id] = d.name

        items = []
        for c in conns:
            links = Connector2KbService.query(connector_id=c.id)
            kb_id = links[0].kb_id if links else None
            kb_name, kb_doc_num = None, None
            if kb_id:
                ok, kb = KnowledgebaseService.get_by_id(kb_id)
                if ok:
                    kb_name, kb_doc_num = kb.name, kb.doc_num

            latest = SyncLogsService.get_latest_task(c.id, kb_id) if kb_id else None
            cfg = c.config or {}
            items.append({
                "id": c.id,
                "name": c.name,
                "department_id": c.department_id,
                "department_name": dept_map.get(c.department_id),
                "kb_id": kb_id,
                "kb_name": kb_name,
                "kb_doc_num": kb_doc_num,
                "root_path": cfg.get("root_path", ""),
                "recursive": cfg.get("recursive", True),
                "sync_deleted_files": cfg.get("sync_deleted_files", True),
                "exclude_dirs": cfg.get("exclude_dirs", []),
                "refresh_freq": c.refresh_freq,
                "status": c.status,
                "last_sync": {
                    "status": latest.status,
                    "total_docs_indexed": latest.total_docs_indexed,
                    "docs_removed": latest.docs_removed_from_index,
                    "update_date": str(latest.update_date) if latest.update_date else None,
                    "error_msg": latest.error_msg,
                } if latest else None,
            })
        items.sort(key=lambda x: (x.get("department_name") or "", x.get("name") or ""))
        return items

    @staticmethod
    def create(data):
        from api.db import InputType
        from common.constants import TaskStatus

        ConnectorService, Connector2KbService, SyncLogsService = FolderMgr._conn_services()
        kb_id = data.get("kb_id")
        if not kb_id:
            raise ValueError("kb_id is required.")
        ok, kb = KnowledgebaseService.get_by_id(kb_id)
        if not ok:
            raise ValueError(f"Knowledge base not found: {kb_id}")

        cfg = FolderMgr._build_config(data)
        refresh_freq = int(data.get("refresh_freq", 1440))
        cid = get_uuid()
        ConnectorService.save(
            id=cid,
            tenant_id=kb.tenant_id,
            department_id=data.get("department_id") or kb.department_id,
            name=(data.get("name") or "").strip() or cfg["root_path"],
            source=FolderMgr.SOURCE,
            input_type=InputType.POLL,
            config=cfg,
            refresh_freq=refresh_freq,
            prune_freq=int(data.get("prune_freq", 1440)),
            timeout_secs=int(data.get("timeout_secs", 60 * 29)),
            status=TaskStatus.SCHEDULE,
        )
        # Linking schedules the first full reindex (reindex=True) for this KB.
        Connector2KbService.link_connectors(kb_id, [{"id": cid, "auto_parse": "1"}], kb.tenant_id)
        # Run the first reindex immediately instead of waiting out the refresh_freq window.
        SyncLogsService.mark_due_now(cid, refresh_freq)
        return {"id": cid}

    @staticmethod
    def update(connector_id, data):
        ConnectorService, _, _ = FolderMgr._conn_services()
        ok, conn = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Connector not found: {connector_id}")

        patch = {}
        cfg_keys = ("root_path", "recursive", "allow_images", "sync_deleted_files", "exclude_dirs")
        if any(k in data for k in cfg_keys):
            merged = dict(conn.config or {})
            merged.update({k: data[k] for k in cfg_keys if k in data})
            patch["config"] = FolderMgr._build_config(merged)
        if data.get("name"):
            patch["name"] = data["name"].strip()
        if "refresh_freq" in data:
            patch["refresh_freq"] = int(data["refresh_freq"])
        if "department_id" in data:
            patch["department_id"] = data["department_id"] or None
        if patch:
            ConnectorService.update_by_id(connector_id, patch)
        return {"id": connector_id}

    @staticmethod
    def delete(connector_id):
        from common.constants import TaskStatus

        ConnectorService, Connector2KbService, _ = FolderMgr._conn_services()
        ok, _conn = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Connector not found: {connector_id}")
        # Cancel scheduled syncs and unlink from KBs. Already-indexed documents
        # are intentionally left in place (mirrors connector unlink semantics).
        ConnectorService.resume(connector_id, TaskStatus.CANCEL)
        c2k = Connector2KbService.model
        Connector2KbService.filter_delete([c2k.connector_id == connector_id])
        ConnectorService.delete_by_id(connector_id)
        return {"id": connector_id}

    @staticmethod
    def sync(connector_id):
        """Manual incremental update: schedule a sync using the last poll window."""
        from common.constants import TaskStatus

        ConnectorService, _, SyncLogsService = FolderMgr._conn_services()
        ok, conn = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Connector not found: {connector_id}")
        # resume(SCHEDULE) re-queues each linked KB from its last poll_range_end
        # (incremental) and is a no-op if a sync is already scheduled/running.
        ConnectorService.resume(connector_id, TaskStatus.SCHEDULE)
        # Bypass the refresh_freq wait window so the manual sync runs right away.
        SyncLogsService.mark_due_now(connector_id, conn.refresh_freq)
        return {"id": connector_id}

    @staticmethod
    def rebuild(connector_id):
        """Manual full rebuild: drop indexed docs and re-pull everything."""
        ConnectorService, Connector2KbService, _ = FolderMgr._conn_services()
        ok, conn = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Connector not found: {connector_id}")
        errors = []
        for link in Connector2KbService.query(connector_id=connector_id):
            err = ConnectorService.rebuild(link.kb_id, connector_id, conn.tenant_id)
            if err:
                errors.append(err)
        return {"id": connector_id, "errors": errors}

    @staticmethod
    def files(connector_id):
        ConnectorService, Connector2KbService, _ = FolderMgr._conn_services()
        ok, _conn = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Connector not found: {connector_id}")
        source_type = f"{FolderMgr.SOURCE}/{connector_id}"
        model = DocumentService.model
        out = []
        for link in Connector2KbService.query(connector_id=connector_id):
            rows = (
                model.select(
                    model.id, model.name, model.size, model.type,
                    model.progress, model.run, model.create_date,
                )
                .where(model.kb_id == link.kb_id, model.source_type == source_type)
                .order_by(model.create_time.desc())
            )
            for d in rows.dicts():
                d["kb_id"] = link.kb_id
                d["create_date"] = str(d["create_date"]) if d.get("create_date") else None
                out.append(d)
        return out


class UserServiceMgr:
    @staticmethod
    def get_user_datasets(username):
        # use email to find user.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        # find tenants
        usr = user_list[0]
        tenants = TenantService.get_joined_tenants_by_user_id(usr.id)
        tenant_ids = [m["tenant_id"] for m in tenants]
        # filter permitted kb and owned kb
        return KnowledgebaseService.get_all_kb_by_tenant_ids(tenant_ids, usr.id)

    @staticmethod
    def get_user_agents(username):
        # use email to find user.
        user_list = UserService.query_user_by_email(username)
        if not user_list:
            raise UserNotFoundError(username)
        elif len(user_list) > 1:
            raise AdminException(f"Exist more than 1 user: {username}!")
        # find tenants
        usr = user_list[0]
        tenants = TenantService.get_joined_tenants_by_user_id(usr.id)
        tenant_ids = [m["tenant_id"] for m in tenants]
        # filter permitted agents and owned agents
        res = UserCanvasService.get_all_agents_by_tenant_ids(tenant_ids, usr.id)
        return [{"title": r["title"], "permission": r["permission"], "canvas_category": r["canvas_category"].split("_")[0], "avatar": r["avatar"]} for r in res]

    @staticmethod
    def get_user_tenants(email: str) -> list[dict[str, Any]]:
        users: list[Any] = UserService.query_user_by_email(email)
        if not users:
            raise UserNotFoundError(email)
        user: Any = users[0]

        tenants: list[dict[str, Any]] = UserTenantService.get_tenants_by_user_id(user.id)
        return tenants


class ServiceMgr:
    @staticmethod
    def get_all_services():
        doc_engine = os.getenv("DOC_ENGINE", "elasticsearch")
        result = []
        configs = SERVICE_CONFIGS.configs
        for service_id, config in enumerate(configs):
            config_dict = config.to_dict()
            if config_dict["service_type"] == "retrieval":
                if config_dict["extra"]["retrieval_type"] != doc_engine:
                    continue
            try:
                service_detail = ServiceMgr.get_service_details(service_id)
                if "status" in service_detail:
                    config_dict["status"] = service_detail["status"]
                else:
                    config_dict["status"] = "timeout"
            except Exception as e:
                logging.warning(f"Can't get service details, error: {e}")
                config_dict["status"] = "timeout"
            if not config_dict["host"]:
                config_dict["host"] = "-"
            if not config_dict["port"]:
                config_dict["port"] = "-"
            result.append(config_dict)
        return result

    @staticmethod
    def get_services_by_type(service_type_str: str):
        raise AdminException("get_services_by_type: not implemented")

    @staticmethod
    def get_service_details(service_id: int):
        service_idx = int(service_id)
        configs = SERVICE_CONFIGS.configs
        if service_idx < 0 or service_idx >= len(configs):
            raise AdminException(f"invalid service_index: {service_idx}")

        service_config = configs[service_idx]

        # exclude retrieval service if retrieval_type is not matched
        doc_engine = os.getenv("DOC_ENGINE", "elasticsearch")
        if service_config.service_type == "retrieval":
            if service_config.retrieval_type != doc_engine:
                raise AdminException(f"invalid service_index: {service_idx}")

        service_info = {"name": service_config.name, "detail_func_name": service_config.detail_func_name}

        detail_func = getattr(health_utils, service_info.get("detail_func_name"))
        res = detail_func()
        res.update({"service_name": service_info.get("name")})
        return res

    @staticmethod
    def shutdown_service(service_id: int):
        raise AdminException("shutdown_service: not implemented")

    @staticmethod
    def restart_service(service_id: int):
        raise AdminException("restart_service: not implemented")


class SettingsMgr:
    @staticmethod
    def get_all():
        settings = SystemSettingsService.get_all()
        result = []
        for setting in settings:
            result.append(
                {
                    "name": setting.name,
                    "source": setting.source,
                    "data_type": setting.data_type,
                    "value": setting.value,
                }
            )
        return result

    @staticmethod
    def get_by_name(name: str):
        settings = SystemSettingsService.get_by_name(name)
        if len(settings) == 0:
            raise AdminException(f"Can't get setting: {name}")
        result = []
        for setting in settings:
            result.append(
                {
                    "name": setting.name,
                    "source": setting.source,
                    "data_type": setting.data_type,
                    "value": setting.value,
                }
            )
        return result

    @staticmethod
    def update_by_name(name: str, value: str):
        settings = SystemSettingsService.get_by_name(name)
        if len(settings) == 1:
            setting = settings[0]
            setting.value = value
            setting_dict = setting.to_dict()
            SystemSettingsService.update_by_name(name, setting_dict)
        elif len(settings) > 1:
            raise AdminException(f"Can't update more than 1 setting: {name}")
        else:
            # Create new setting if it doesn't exist

            # Determine data_type based on name and value
            if name.startswith("sandbox."):
                data_type = "json"
            elif name.endswith(".enabled"):
                data_type = "boolean"
            else:
                data_type = "string"

            new_setting = {
                "name": name,
                "value": str(value),
                "source": "admin",
                "data_type": data_type,
            }
            SystemSettingsService.save(**new_setting)


class ConfigMgr:
    @staticmethod
    def get_all():
        result = []
        configs = SERVICE_CONFIGS.configs
        for config in configs:
            config_dict = config.to_dict()
            result.append(config_dict)
        return result


class EnvironmentsMgr:
    @staticmethod
    def get_all():
        result = []

        env_kv = {"env": "DOC_ENGINE", "value": os.getenv("DOC_ENGINE")}
        result.append(env_kv)

        env_kv = {"env": "DEFAULT_SUPERUSER_EMAIL", "value": os.getenv("DEFAULT_SUPERUSER_EMAIL", "admin@ragflow.io")}
        result.append(env_kv)

        env_kv = {"env": "DB_TYPE", "value": os.getenv("DB_TYPE", "mysql")}
        result.append(env_kv)

        env_kv = {"env": "DEVICE", "value": os.getenv("DEVICE", "cpu")}
        result.append(env_kv)

        env_kv = {"env": "STORAGE_IMPL", "value": os.getenv("STORAGE_IMPL", "MINIO")}
        result.append(env_kv)

        return result


class SandboxMgr:
    """Manager for sandbox provider configuration and operations."""

    # Provider registry with metadata
    PROVIDER_REGISTRY = {
        "self_managed": {
            "name": "Self-Managed",
            "description": "On-premise deployment using Daytona/Docker",
            "tags": ["self-hosted", "low-latency", "secure"],
        },
        "aliyun_codeinterpreter": {
            "name": "Aliyun Code Interpreter",
            "description": "Aliyun Function Compute Code Interpreter - Code execution in serverless microVMs",
            "tags": ["saas", "cloud", "scalable", "aliyun"],
        },
        "e2b": {
            "name": "E2B",
            "description": "E2B Cloud - Code Execution Sandboxes",
            "tags": ["saas", "fast", "global"],
        },
    }

    @staticmethod
    def list_providers():
        """List all available sandbox providers."""
        result = []
        for provider_id, metadata in SandboxMgr.PROVIDER_REGISTRY.items():
            result.append({
                "id": provider_id,
                **metadata
            })
        return result

    @staticmethod
    def get_provider_config_schema(provider_id: str):
        """Get configuration schema for a specific provider."""
        from agent.sandbox.providers import (
            SelfManagedProvider,
            AliyunCodeInterpreterProvider,
            E2BProvider,
        )

        schemas = {
            "self_managed": SelfManagedProvider.get_config_schema(),
            "aliyun_codeinterpreter": AliyunCodeInterpreterProvider.get_config_schema(),
            "e2b": E2BProvider.get_config_schema(),
        }

        if provider_id not in schemas:
            raise AdminException(f"Unknown provider: {provider_id}")

        return schemas.get(provider_id, {})

    @staticmethod
    def get_config():
        """Get current sandbox configuration."""
        try:
            # Get active provider type
            provider_type_settings = SystemSettingsService.get_by_name("sandbox.provider_type")
            if not provider_type_settings:
                # Return default config if not set
                provider_type = "self_managed"
            else:
                provider_type = provider_type_settings[0].value

            # Get provider-specific config
            provider_config_settings = SystemSettingsService.get_by_name(f"sandbox.{provider_type}")
            if not provider_config_settings:
                provider_config = {}
            else:
                try:
                    provider_config = json.loads(provider_config_settings[0].value)
                except json.JSONDecodeError:
                    provider_config = {}

            return {
                "provider_type": provider_type,
                "config": provider_config,
            }
        except Exception as e:
            raise AdminException(f"Failed to get sandbox config: {str(e)}")

    @staticmethod
    def set_config(provider_type: str, config: dict, set_active: bool = True):
        """
        Set sandbox provider configuration.

        Args:
            provider_type: Provider identifier (e.g., "self_managed", "e2b")
            config: Provider configuration dictionary
            set_active: If True, also update the active provider. If False,
                       only update the configuration without switching providers.
                       Default: True

        Returns:
            Dictionary with updated provider_type and config
        """
        from agent.sandbox.providers import (
            SelfManagedProvider,
            AliyunCodeInterpreterProvider,
            E2BProvider,
        )

        try:
            # Validate provider type
            if provider_type not in SandboxMgr.PROVIDER_REGISTRY:
                raise AdminException(f"Unknown provider type: {provider_type}")

            # Get provider schema for validation
            schema = SandboxMgr.get_provider_config_schema(provider_type)

            # Validate config against schema
            for field_name, field_schema in schema.items():
                if field_schema.get("required", False) and field_name not in config:
                    raise AdminException(f"Required field '{field_name}' is missing")

                # Type validation
                if field_name in config:
                    field_type = field_schema.get("type")
                    if field_type == "integer":
                        if not isinstance(config[field_name], int):
                            raise AdminException(f"Field '{field_name}' must be an integer")
                    elif field_type == "string":
                        if not isinstance(config[field_name], str):
                            raise AdminException(f"Field '{field_name}' must be a string")
                    elif field_type == "bool":
                        if not isinstance(config[field_name], bool):
                            raise AdminException(f"Field '{field_name}' must be a boolean")

                    # Range validation for integers
                    if field_type == "integer" and field_name in config:
                        min_val = field_schema.get("min")
                        max_val = field_schema.get("max")
                        if min_val is not None and config[field_name] < min_val:
                            raise AdminException(f"Field '{field_name}' must be >= {min_val}")
                        if max_val is not None and config[field_name] > max_val:
                            raise AdminException(f"Field '{field_name}' must be <= {max_val}")

            # Provider-specific custom validation
            provider_classes = {
                "self_managed": SelfManagedProvider,
                "aliyun_codeinterpreter": AliyunCodeInterpreterProvider,
                "e2b": E2BProvider,
            }
            provider = provider_classes[provider_type]()
            is_valid, error_msg = provider.validate_config(config)
            if not is_valid:
                raise AdminException(f"Provider validation failed: {error_msg}")

            # Update provider_type only if set_active is True
            if set_active:
                SettingsMgr.update_by_name("sandbox.provider_type", provider_type)

            # Always update the provider config
            config_json = json.dumps(config)
            SettingsMgr.update_by_name(f"sandbox.{provider_type}", config_json)

            return {"provider_type": provider_type, "config": config}
        except AdminException:
            raise
        except Exception as e:
            raise AdminException(f"Failed to set sandbox config: {str(e)}")

    @staticmethod
    def test_connection(provider_type: str, config: dict):
        """
        Test connection to sandbox provider by executing a simple Python script.

        This creates a temporary sandbox instance and runs a test code to verify:
        - Connection credentials are valid
        - Sandbox can be created
        - Code execution works correctly

        Args:
            provider_type: Provider identifier
            config: Provider configuration dictionary

        Returns:
            dict with test results including stdout, stderr, exit_code, execution_time
        """
        try:
            from agent.sandbox.providers import (
                SelfManagedProvider,
                AliyunCodeInterpreterProvider,
                E2BProvider,
            )

            # Instantiate provider based on type
            provider_classes = {
                "self_managed": SelfManagedProvider,
                "aliyun_codeinterpreter": AliyunCodeInterpreterProvider,
                "e2b": E2BProvider,
            }

            if provider_type not in provider_classes:
                raise AdminException(f"Unknown provider type: {provider_type}")

            provider = provider_classes[provider_type]()

            # Initialize with config
            if not provider.initialize(config):
                raise AdminException(f"Failed to initialize provider '{provider_type}'")

            # Create a temporary sandbox instance for testing
            instance = provider.create_instance(template="python")

            if not instance or instance.status != "READY":
                raise AdminException(f"Failed to create sandbox instance. Status: {instance.status if instance else 'None'}")

            # Simple test code that exercises basic Python functionality
            test_code = """
# Test basic Python functionality
import sys
import json
import math

print("Python version:", sys.version)
print("Platform:", sys.platform)

# Test basic calculations
result = 2 + 2
print(f"2 + 2 = {result}")

# Test JSON operations
data = {"test": "data", "value": 123}
print(f"JSON dump: {json.dumps(data)}")

# Test math operations
print(f"Math.sqrt(16) = {math.sqrt(16)}")

# Test error handling
try:
    x = 1 / 1
    print("Division test: OK")
except Exception as e:
    print(f"Error: {e}")

# Return success indicator
print("TEST_PASSED")
"""

            # Execute test code with timeout
            execution_result = provider.execute_code(
                instance_id=instance.instance_id,
                code=test_code,
                language="python",
                timeout=10  # 10 seconds timeout
            )

            # Clean up the test instance (if provider supports it)
            try:
                if hasattr(provider, 'terminate_instance'):
                    provider.terminate_instance(instance.instance_id)
                    logging.info(f"Cleaned up test instance {instance.instance_id}")
                else:
                    logging.warning(f"Provider {provider_type} does not support terminate_instance, test instance may leak")
            except Exception as cleanup_error:
                logging.warning(f"Failed to cleanup test instance {instance.instance_id}: {cleanup_error}")

            # Build detailed result message
            success = execution_result.exit_code == 0 and "TEST_PASSED" in execution_result.stdout

            message_parts = [
                f"Test {success and 'PASSED' or 'FAILED'}",
                f"Exit code: {execution_result.exit_code}",
                f"Execution time: {execution_result.execution_time:.2f}s"
            ]

            if execution_result.stdout.strip():
                stdout_preview = execution_result.stdout.strip()[:200]
                message_parts.append(f"Output: {stdout_preview}...")

            if execution_result.stderr.strip():
                stderr_preview = execution_result.stderr.strip()[:200]
                message_parts.append(f"Errors: {stderr_preview}...")

            message = " | ".join(message_parts)

            return {
                "success": success,
                "message": message,
                "details": {
                    "exit_code": execution_result.exit_code,
                    "execution_time": execution_result.execution_time,
                    "stdout": execution_result.stdout,
                    "stderr": execution_result.stderr,
                }
            }

        except AdminException:
            raise
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            raise AdminException(f"Connection test failed: {str(e)}\\n\\nStack trace:\\n{error_details}")
