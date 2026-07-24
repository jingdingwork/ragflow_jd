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

import secrets
import logging
from typing import Any

from common.time_utils import current_timestamp, datetime_format
from datetime import datetime
from flask import Blueprint, Response, request
from flask_login import current_user, login_required, logout_user

from auth import login_verify, login_admin, check_admin_auth
from responses import success_response, error_response
from services import UserMgr, DepartmentMgr, GlobalLLMMgr, ModelCatalogMgr, ChatHistoryMgr, ApplicationMgr, EsDataMgr, KbPermissionMgr, RetrievalMgr, PromptMgr, FolderMgr, ServiceMgr, UserServiceMgr, SettingsMgr, ConfigMgr, EnvironmentsMgr, SandboxMgr
from roles import RoleMgr
from api.common.exceptions import AdminException
from common.versions import get_ragflow_version
from api.utils.api_utils import generate_confirmation_token
from common.log_utils import get_log_levels, set_log_level

admin_bp = Blueprint("admin", __name__, url_prefix="/api/v1/admin")


@admin_bp.route("/ping", methods=["GET"])
def ping():
    return success_response(message="pong")


@admin_bp.route("/login", methods=["POST"])
def login():
    if not request.json:
        return error_response("Authorize admin failed.", 400)
    try:
        email = request.json.get("email", "")
        password = request.json.get("password", "")
        return login_admin(email, password)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/logout", methods=["GET"])
@login_required
def logout():
    try:
        current_user.access_token = f"INVALID_{secrets.token_hex(16)}"
        current_user.save()
        logout_user()
        return success_response(True)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/auth", methods=["GET"])
@login_verify
def auth_admin():
    try:
        return success_response(None, "Admin is authorized", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users", methods=["GET"])
@login_required
@check_admin_auth
def list_users():
    try:
        users = UserMgr.get_all_users()
        return success_response(users, "Get all users", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/tree", methods=["GET"])
@login_required
@check_admin_auth
def get_department_tree():
    try:
        tree = DepartmentMgr.get_department_tree()
        return success_response(tree, "Get department tree", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/sync", methods=["POST"])
@login_required
@check_admin_auth
def sync_departments():
    try:
        stats = DepartmentMgr.sync_all_from_keycloak()
        return success_response(stats, "Sync departments", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/export", methods=["GET"])
@login_required
@check_admin_auth
def export_departments():
    try:
        data = DepartmentMgr.export_members()
        return Response(
            data,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=departments.xlsx"},
        )
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/llm/fetch-models", methods=["POST"])
@login_required
@check_admin_auth
def fetch_department_models():
    try:
        data = request.get_json() or {}
        models = DepartmentMgr.fetch_models(data.get("api_base", ""), data.get("api_key", ""))
        return success_response(models, "Fetch models", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/llm/configs", methods=["GET"])
@login_required
@check_admin_auth
def list_department_llm_configs():
    try:
        configs = DepartmentMgr.list_llm_configs()
        return success_response(configs, "List department LLM configs", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/<department_id>/llm", methods=["GET"])
@login_required
@check_admin_auth
def get_department_llm(department_id):
    try:
        config = DepartmentMgr.get_llm_config(department_id)
        return success_response(config, "Get department LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/<department_id>/llm", methods=["POST"])
@login_required
@check_admin_auth
def save_department_llm(department_id):
    try:
        data = request.get_json() or {}
        stats = DepartmentMgr.save_llm_config(
            department_id,
            data.get("api_base", ""),
            data.get("api_key", ""),
            data.get("models", []),
        )
        return success_response(stats, "Save department LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/llm/resync-all", methods=["POST"])
@login_required
@check_admin_auth
def resync_all_department_llm():
    try:
        stats = DepartmentMgr.resync_all_llm_models()
        return success_response(stats, "Resync all department models", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/global-llm/fetch-models", methods=["POST"])
@login_required
@check_admin_auth
def fetch_global_llm_models():
    try:
        data = request.get_json() or {}
        models = GlobalLLMMgr.fetch_models(data.get("api_base", ""), data.get("api_key", ""))
        return success_response(models, "Fetch global models", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/global-llm", methods=["GET"])
@login_required
@check_admin_auth
def get_global_llm():
    try:
        config = GlobalLLMMgr.get_config()
        return success_response(config, "Get global LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/global-llm", methods=["POST"])
@login_required
@check_admin_auth
def save_global_llm():
    try:
        data = request.get_json() or {}
        stats = GlobalLLMMgr.save_config(
            data.get("api_base", ""),
            data.get("api_key", ""),
            data.get("models", {}),
        )
        return success_response(stats, "Save global LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/departments/<department_id>/llm/resync", methods=["POST"])
@login_required
@check_admin_auth
def resync_department_llm(department_id):
    try:
        stats = DepartmentMgr.resync_llm_models(department_id)
        return success_response(stats, "Resync department models", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/model-catalog", methods=["GET"])
@login_required
@check_admin_auth
def list_model_catalog():
    try:
        models = ModelCatalogMgr.list_models()
        return success_response(models, "List model catalog", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/model-catalog", methods=["POST"])
@login_required
@check_admin_auth
def create_model_catalog():
    try:
        data = request.get_json() or {}
        model = ModelCatalogMgr.create_model(
            data.get("llm_name", ""),
            data.get("capabilities", []),
            data.get("custom_tags", []),
        )
        return success_response(model, "Create catalog model", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/model-catalog/<catalog_id>", methods=["PUT"])
@login_required
@check_admin_auth
def update_model_catalog(catalog_id):
    try:
        data = request.get_json() or {}
        model = ModelCatalogMgr.update_model(
            catalog_id,
            data.get("llm_name", ""),
            data.get("capabilities", []),
            data.get("custom_tags", []),
        )
        return success_response(model, "Update catalog model", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/model-catalog/sync", methods=["POST"])
@login_required
@check_admin_auth
def sync_model_catalog():
    try:
        result = ModelCatalogMgr.sync_models()
        return success_response(result, "Sync model catalog", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/model-catalog/<catalog_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_model_catalog(catalog_id):
    try:
        result = ModelCatalogMgr.delete_model(catalog_id)
        return success_response(result, "Delete catalog model", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/prompts", methods=["GET"])
@login_required
@check_admin_auth
def list_prompts():
    try:
        items = PromptMgr.list_all()
        return success_response(items, "List prompt templates", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/prompts", methods=["POST"])
@login_required
@check_admin_auth
def create_prompt():
    try:
        data = request.get_json() or {}
        res = PromptMgr.create(data)
        return success_response(res, "Create prompt template", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/prompts/<template_id>", methods=["PUT"])
@login_required
@check_admin_auth
def update_prompt(template_id):
    try:
        data = request.get_json() or {}
        res = PromptMgr.update(template_id, data)
        return success_response(res, "Update prompt template", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/prompts/<template_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_prompt(template_id):
    try:
        res = PromptMgr.delete(template_id)
        return success_response(res, "Delete prompt template", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders", methods=["GET"])
@login_required
@check_admin_auth
def list_dept_folders():
    try:
        return success_response(FolderMgr.list_all(), "List department folders", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/test", methods=["POST"])
@login_required
@check_admin_auth
def test_dept_folder():
    try:
        data = request.get_json() or {}
        return success_response(FolderMgr.test(data), "Test department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders", methods=["POST"])
@login_required
@check_admin_auth
def create_dept_folder():
    try:
        data = request.get_json() or {}
        return success_response(FolderMgr.create(data), "Create department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/<connector_id>", methods=["PUT"])
@login_required
@check_admin_auth
def update_dept_folder(connector_id):
    try:
        data = request.get_json() or {}
        return success_response(FolderMgr.update(connector_id, data), "Update department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/<connector_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_dept_folder(connector_id):
    try:
        return success_response(FolderMgr.delete(connector_id), "Delete department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/<connector_id>/sync", methods=["POST"])
@login_required
@check_admin_auth
def sync_dept_folder(connector_id):
    try:
        return success_response(FolderMgr.sync(connector_id), "Sync department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/<connector_id>/rebuild", methods=["POST"])
@login_required
@check_admin_auth
def rebuild_dept_folder(connector_id):
    try:
        return success_response(FolderMgr.rebuild(connector_id), "Rebuild department folder", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/dept-folders/<connector_id>/files", methods=["GET"])
@login_required
@check_admin_auth
def list_dept_folder_files(connector_id):
    try:
        return success_response(FolderMgr.files(connector_id), "List department folder files", 0)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<email>/dept-admin", methods=["POST"])
@login_required
@check_admin_auth
def set_dept_admin(email):
    try:
        data = request.get_json() or {}
        result = UserMgr.set_dept_admin(email, bool(data.get("is_dept_admin", False)))
        return success_response(result, "Set department admin", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<email>/impersonate", methods=["POST"])
@login_required
@check_admin_auth
def impersonate_user(email):
    try:
        result = UserMgr.impersonate_user(email)
        logging.warning(
            f"[IMPERSONATE] admin={current_user.email} signed in as user={email}"
        )
        return success_response(result, "Impersonate user", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<email>/llm", methods=["GET"])
@login_required
@check_admin_auth
def get_user_llm(email):
    try:
        config = DepartmentMgr.get_user_llm(email)
        return success_response(config, "Get user LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<email>/llm", methods=["POST"])
@login_required
@check_admin_auth
def save_user_llm(email):
    try:
        data = request.get_json() or {}
        stats = DepartmentMgr.save_user_llm(email, data.get("models", []))
        return success_response(stats, "Save user LLM config", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/chat-history/stats", methods=["GET"])
@login_required
@check_admin_auth
def chat_history_stats():
    try:
        stats = ChatHistoryMgr.get_stats()
        return success_response(stats, "Chat history stats", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/chat-history/overview", methods=["GET"])
@login_required
@check_admin_auth
def chat_history_overview():
    try:
        start_ms = int(request.args.get("start", 0) or 0)
        end_ms = int(request.args.get("end", 0) or 0) or None
        tree = ChatHistoryMgr.get_overview(start_ms, end_ms)
        return success_response(tree, "Chat history overview", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/chat-history/users/<user_id>/conversations", methods=["GET"])
@login_required
@check_admin_auth
def chat_history_user_conversations(user_id):
    try:
        start_ms = int(request.args.get("start", 0) or 0)
        end_ms = int(request.args.get("end", 0) or 0) or None
        page = int(request.args.get("page", 1) or 1)
        size = int(request.args.get("size", 20) or 20)
        result = ChatHistoryMgr.list_user_conversations(user_id, start_ms, end_ms, page, size)
        return success_response(result, "User conversations", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/chat-history/conversations/<conversation_id>", methods=["GET"])
@login_required
@check_admin_auth
def chat_history_conversation_detail(conversation_id):
    try:
        source = request.args.get("source", "chat")
        detail = ChatHistoryMgr.get_conversation_detail(conversation_id, source)
        return success_response(detail, "Conversation detail", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications", methods=["GET"])
@login_required
@check_admin_auth
def list_applications():
    try:
        apps = ApplicationMgr.list_applications()
        return success_response(apps, "List applications", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>", methods=["GET"])
@login_required
@check_admin_auth
def get_application(application_id):
    try:
        app = ApplicationMgr.get_application(application_id)
        return success_response(app, "Get application", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications", methods=["POST"])
@login_required
@check_admin_auth
def create_application():
    try:
        data = request.get_json() or {}
        app = ApplicationMgr.create_application(data)
        return success_response(app, "Application created", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>", methods=["PUT"])
@login_required
@check_admin_auth
def update_application(application_id):
    try:
        data = request.get_json() or {}
        app = ApplicationMgr.update_application(application_id, data)
        return success_response(app, "Application updated", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_application(application_id):
    try:
        res = ApplicationMgr.delete_application(application_id)
        return success_response(res, "Application deleted", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>/versions", methods=["POST"])
@login_required
@check_admin_auth
def add_application_version(application_id):
    try:
        file = request.files.get("file")
        if file is None:
            return error_response("Installation package is required", 400)
        version = request.form.get("version", "")
        description = request.form.get("description", "")
        binary = file.read()
        app = ApplicationMgr.add_version(
            application_id, version, description, file.filename, binary
        )
        return success_response(app, "Version added", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>/versions/<version_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_application_version(application_id, version_id):
    try:
        app = ApplicationMgr.delete_version(application_id, version_id)
        return success_response(app, "Version deleted", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/applications/<application_id>/versions/<version_id>/latest", methods=["PUT"])
@login_required
@check_admin_auth
def set_latest_application_version(application_id, version_id):
    try:
        app = ApplicationMgr.set_latest_version(application_id, version_id)
        return success_response(app, "Latest version set", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases", methods=["GET"])
@login_required
@check_admin_auth
def es_list_knowledgebases():
    try:
        kbs = EsDataMgr.list_knowledgebases()
        return success_response(kbs, "List knowledge bases", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases/<kb_id>/company", methods=["PUT"])
@login_required
@check_admin_auth
def set_kb_company_level(kb_id):
    """Promote / demote a knowledge base to company-wide visibility."""
    try:
        body = request.get_json(force=True) or {}
        enabled = bool(body.get("enabled"))
        kb = KbPermissionMgr.set_company_level(kb_id, enabled)
        return success_response(kb, "Knowledge base visibility updated", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases/<kb_id>/stats", methods=["GET"])
@login_required
@check_admin_auth
def es_kb_stats(kb_id):
    try:
        stats = EsDataMgr.get_stats(kb_id)
        return success_response(stats, "Knowledge base ES stats", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases/<kb_id>/documents", methods=["GET"])
@login_required
@check_admin_auth
def es_kb_documents(kb_id):
    try:
        docs = EsDataMgr.list_documents(kb_id)
        return success_response(docs, "Knowledge base documents", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases/<kb_id>/chunks", methods=["GET"])
@login_required
@check_admin_auth
def es_kb_chunks(kb_id):
    try:
        question = request.args.get("q", "")
        doc_id = request.args.get("doc_id", "")
        page = int(request.args.get("page", 1) or 1)
        size = int(request.args.get("size", 20) or 20)
        available_arg = request.args.get("available")
        available = None
        if available_arg in ("0", "1"):
            available = int(available_arg)
        res = EsDataMgr.search_chunks(kb_id, question, doc_id, page, size, available)
        return success_response(res, "Knowledge base chunks", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/es/knowledgebases/<kb_id>/chunks/<chunk_id>", methods=["GET"])
@login_required
@check_admin_auth
def es_kb_chunk_detail(kb_id, chunk_id):
    try:
        chunk = EsDataMgr.get_chunk(kb_id, chunk_id)
        return success_response(chunk, "Chunk detail", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/retrieval/test", methods=["POST"])
@login_required
@check_admin_auth
def retrieval_test():
    try:
        body = request.json or {}
        kb_id = body.get("kb_id", "")
        if not kb_id:
            return error_response("`kb_id` is required.", 400)
        question = body.get("question", "")
        doc_id = body.get("doc_id", "")
        top_k = int(body.get("top_k", 1024) or 1024)
        page_size = int(body.get("page_size", 20) or 20)
        similarity_threshold = float(body.get("similarity_threshold", 0.0) or 0.0)
        vector_similarity_weight = float(body.get("vector_similarity_weight", 0.3) or 0.0)
        res = RetrievalMgr.run(
            kb_id, question, doc_id, top_k, page_size,
            similarity_threshold, vector_similarity_weight,
        )
        return success_response(res, "Retrieval test", 0)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users", methods=["POST"])
@login_required
@check_admin_auth
def create_user():
    try:
        data = request.get_json()
        if not data or "username" not in data or "password" not in data:
            return error_response("Username and password are required", 400)

        username = data["username"]
        password = data["password"]
        role = data.get("role", "user")

        res = UserMgr.create_user(username, password, role)
        if res["success"]:
            user_info = res["user_info"]
            user_info.pop("password")  # do not return password
            return success_response(user_info, "User created successfully")
        else:
            return error_response("create user failed")

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e))


@admin_bp.route("/users/<username>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_user(username):
    try:
        res = UserMgr.delete_user(username)
        if res["success"]:
            return success_response(None, res["message"])
        else:
            return error_response(res["message"])

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/password", methods=["PUT"])
@login_required
@check_admin_auth
def change_password(username):
    try:
        data = request.get_json()
        if not data or "new_password" not in data:
            return error_response("New password is required", 400)

        new_password = data["new_password"]
        msg = UserMgr.update_user_password(username, new_password)
        return success_response(None, msg)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/activate", methods=["PUT"])
@login_required
@check_admin_auth
def alter_user_activate_status(username):
    try:
        data = request.get_json()
        if not data or "activate_status" not in data:
            return error_response("Activation status is required", 400)
        activate_status = data["activate_status"]
        msg = UserMgr.update_user_activate_status(username, activate_status)
        return success_response(None, msg)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/admin", methods=["PUT"])
@login_required
@check_admin_auth
def grant_admin(username):
    try:
        if current_user.email == username:
            return error_response(f"can't grant current user: {username}", 409)
        msg = UserMgr.grant_admin(username)
        return success_response(None, msg)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/admin", methods=["DELETE"])
@login_required
@check_admin_auth
def revoke_admin(username):
    try:
        if current_user.email == username:
            return error_response(f"can't grant current user: {username}", 409)
        msg = UserMgr.revoke_admin(username)
        return success_response(None, msg)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>", methods=["GET"])
@login_required
@check_admin_auth
def get_user_details(username):
    try:
        user_details = UserMgr.get_user_details(username)
        return success_response(user_details)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/datasets", methods=["GET"])
@login_required
@check_admin_auth
def get_user_datasets(username):
    try:
        datasets_list = UserServiceMgr.get_user_datasets(username)
        return success_response(datasets_list)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/agents", methods=["GET"])
@login_required
@check_admin_auth
def get_user_agents(username):
    try:
        agents_list = UserServiceMgr.get_user_agents(username)
        return success_response(agents_list)

    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/services", methods=["GET"])
@login_required
@check_admin_auth
def get_services():
    try:
        services = ServiceMgr.get_all_services()
        return success_response(services, "Get all services", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/service_types/<service_type>", methods=["GET"])
@login_required
@check_admin_auth
def get_services_by_type(service_type_str):
    try:
        services = ServiceMgr.get_services_by_type(service_type_str)
        return success_response(services)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/services/<service_id>", methods=["GET"])
@login_required
@check_admin_auth
def get_service(service_id):
    try:
        services = ServiceMgr.get_service_details(service_id)
        return success_response(services)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/services/<service_id>", methods=["DELETE"])
@login_required
@check_admin_auth
def shutdown_service(service_id):
    try:
        services = ServiceMgr.shutdown_service(service_id)
        return success_response(services)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/services/<service_id>", methods=["PUT"])
@login_required
@check_admin_auth
def restart_service(service_id):
    try:
        services = ServiceMgr.restart_service(service_id)
        return success_response(services)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles", methods=["POST"])
@login_required
@check_admin_auth
def create_role():
    try:
        data = request.get_json()
        if not data or "role_name" not in data:
            return error_response("Role name is required", 400)
        role_name: str = data["role_name"]
        description: str = data["description"]
        res = RoleMgr.create_role(role_name, description)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles/<role_name>", methods=["PUT"])
@login_required
@check_admin_auth
def update_role(role_name: str):
    try:
        data = request.get_json()
        if not data or "description" not in data:
            return error_response("Role description is required", 400)
        description: str = data["description"]
        res = RoleMgr.update_role_description(role_name, description)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles/<role_name>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_role(role_name: str):
    try:
        res = RoleMgr.delete_role(role_name)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles", methods=["GET"])
@login_required
@check_admin_auth
def list_roles():
    try:
        res = RoleMgr.list_roles()
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles/<role_name>/permission", methods=["GET"])
@login_required
@check_admin_auth
def get_role_permission(role_name: str):
    try:
        res = RoleMgr.get_role_permission(role_name)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles/<role_name>/permission", methods=["POST"])
@login_required
@check_admin_auth
def grant_role_permission(role_name: str):
    try:
        data = request.get_json()
        if not data or "actions" not in data or "resource" not in data:
            return error_response("Permission is required", 400)
        actions: list = data["actions"]
        resource: str = data["resource"]
        res = RoleMgr.grant_role_permission(role_name, actions, resource)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/roles/<role_name>/permission", methods=["DELETE"])
@login_required
@check_admin_auth
def revoke_role_permission(role_name: str):
    try:
        data = request.get_json()
        if not data or "actions" not in data or "resource" not in data:
            return error_response("Permission is required", 400)
        actions: list = data["actions"]
        resource: str = data["resource"]
        res = RoleMgr.revoke_role_permission(role_name, actions, resource)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<user_name>/role", methods=["PUT"])
@login_required
@check_admin_auth
def update_user_role(user_name: str):
    try:
        data = request.get_json()
        if not data or "role_name" not in data:
            return error_response("Role name is required", 400)
        role_name: str = data["role_name"]
        res = RoleMgr.update_user_role(user_name, role_name)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<user_name>/permission", methods=["GET"])
@login_required
@check_admin_auth
def get_user_permission(user_name: str):
    try:
        res = RoleMgr.get_user_permission(user_name)
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/variables", methods=["PUT"])
@login_required
@check_admin_auth
def set_variable():
    try:
        data = request.get_json()
        if not data and "var_name" not in data:
            return error_response("Var name is required", 400)

        if "var_value" not in data:
            return error_response("Var value is required", 400)
        var_name: str = data["var_name"]
        var_value: str = data["var_value"]

        SettingsMgr.update_by_name(var_name, var_value)
        return success_response(None, "Set variable successfully")
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/variables", methods=["GET"])
@login_required
@check_admin_auth
def get_variable():
    try:
        if request.content_length is None or request.content_length == 0:
            # list variables
            res = list(SettingsMgr.get_all())
            return success_response(res)

        # get var
        data = request.get_json()
        if not data and "var_name" not in data:
            return error_response("Var name is required", 400)
        var_name: str = data["var_name"]
        res = SettingsMgr.get_by_name(var_name)
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/configs", methods=["GET"])
@login_required
@check_admin_auth
def get_config():
    try:
        res = list(ConfigMgr.get_all())
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/environments", methods=["GET"])
@login_required
@check_admin_auth
def get_environments():
    try:
        res = list(EnvironmentsMgr.get_all())
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/keys", methods=["POST"])
@login_required
@check_admin_auth
def generate_user_api_key(username: str) -> tuple[Response, int]:
    try:
        user_details: list[dict[str, Any]] = UserMgr.get_user_details(username)
        if not user_details:
            return error_response("User not found!", 404)
        tenants: list[dict[str, Any]] = UserServiceMgr.get_user_tenants(username)
        if not tenants:
            return error_response("Tenant not found!", 404)
        tenant_id: str = tenants[0]["tenant_id"]
        key: str = generate_confirmation_token()
        obj: dict[str, Any] = {
            "tenant_id": tenant_id,
            "token": key,
            "beta": generate_confirmation_token().replace("ragflow-", "")[:32],
            "create_time": current_timestamp(),
            "create_date": datetime_format(datetime.now()),
            "update_time": None,
            "update_date": None,
        }

        if not UserMgr.save_api_key(obj):
            return error_response("Failed to generate API key!", 500)
        return success_response(obj, "API key generated successfully")
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/keys", methods=["GET"])
@login_required
@check_admin_auth
def get_user_api_keys(username: str) -> tuple[Response, int]:
    try:
        api_keys: list[dict[str, Any]] = UserMgr.get_user_api_key(username)
        return success_response(api_keys, "Get user API keys")
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/users/<username>/keys/<key>", methods=["DELETE"])
@login_required
@check_admin_auth
def delete_user_api_key(username: str, key: str) -> tuple[Response, int]:
    try:
        deleted = UserMgr.delete_api_key(username, key)
        if deleted:
            return success_response(None, "API key deleted successfully")
        else:
            return error_response("API key not found or could not be deleted", 404)
    except AdminException as e:
        return error_response(e.message, e.code)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/version", methods=["GET"])
@login_required
@check_admin_auth
def show_version():
    try:
        res = {"version": get_ragflow_version()}
        return success_response(res)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/sandbox/providers", methods=["GET"])
@login_required
@check_admin_auth
def list_sandbox_providers():
    """List all available sandbox providers."""
    try:
        res = SandboxMgr.list_providers()
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/sandbox/providers/<provider_id>/schema", methods=["GET"])
@login_required
@check_admin_auth
def get_sandbox_provider_schema(provider_id: str):
    """Get configuration schema for a specific provider."""
    try:
        res = SandboxMgr.get_provider_config_schema(provider_id)
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/sandbox/config", methods=["GET"])
@login_required
@check_admin_auth
def get_sandbox_config():
    """Get current sandbox configuration."""
    try:
        res = SandboxMgr.get_config()
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/sandbox/config", methods=["POST"])
@login_required
@check_admin_auth
def set_sandbox_config():
    """Set sandbox provider configuration."""
    try:
        data = request.get_json()
        if not data:
            logging.error("set_sandbox_config: Request body is required")
            return error_response("Request body is required", 400)

        provider_type = data.get("provider_type")
        if not provider_type:
            logging.error("set_sandbox_config: provider_type is required")
            return error_response("provider_type is required", 400)

        config = data.get("config", {})
        set_active = data.get("set_active", True)  # Default to True for backward compatibility

        logging.info(f"set_sandbox_config: provider_type={provider_type}, set_active={set_active}")
        logging.info(f"set_sandbox_config: config keys={list(config.keys())}")

        res = SandboxMgr.set_config(provider_type, config, set_active)
        return success_response(res, "Sandbox configuration updated successfully")
    except AdminException as e:
        logging.exception("set_sandbox_config AdminException")
        return error_response(str(e), 400)
    except Exception as e:
        logging.exception("set_sandbox_config unexpected error")
        return error_response(str(e), 500)


@admin_bp.route("/sandbox/test", methods=["POST"])
@login_required
@check_admin_auth
def test_sandbox_connection():
    """Test connection to sandbox provider."""
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body is required", 400)

        provider_type = data.get("provider_type")
        if not provider_type:
            return error_response("provider_type is required", 400)

        config = data.get("config", {})
        res = SandboxMgr.test_connection(provider_type, config)
        return success_response(res)
    except AdminException as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/log_levels", methods=["GET"])
@login_required
@check_admin_auth
def get_logger_levels():
    """Get current log levels for all packages."""
    try:
        res = get_log_levels()
        return success_response(res, "Get log levels", 0)
    except Exception as e:
        return error_response(str(e), 500)


@admin_bp.route("/log_levels", methods=["PUT"])
@login_required
@check_admin_auth
def set_logger_level():
    """Set log level for a package."""
    try:
        data = request.get_json()
        if not data or "pkg_name" not in data or "level" not in data:
            return error_response("pkg_name and level are required", 400)

        pkg_name = data["pkg_name"]
        level = data["level"]
        if not isinstance(pkg_name, str) or not isinstance(level, str):
            return error_response("pkg_name and level must be strings", 400)

        success = set_log_level(pkg_name, level)
        if success:
            return success_response({"pkg_name": pkg_name, "level": level}, "Log level updated successfully")
        else:
            return error_response(f"Invalid log level: {level}", 400)
    except Exception as e:
        return error_response(str(e), 500)
