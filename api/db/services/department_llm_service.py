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

from api.db.db_models import DB, DepartmentLLM, DepartmentLLMModel, TenantLLM
from api.db.services.common_service import CommonService
from api.db.services.tenant_llm_service import TenantLLMService
from api.db.services.user_service import UserService
from common.constants import LLMType, StatusEnum
from common.http_client import sync_request
from common.misc_utils import get_uuid

# Department-configured models are provisioned as OpenAI-compatible chat models.
OPENAI_COMPATIBLE_FACTORY = "OpenAI-API-Compatible"

# Department chat models live in their OWN factory namespace, distinct from the
# global "other models" (auxiliary) config which keeps OPENAI_COMPATIBLE_FACTORY.
# tenant_llm's uniqueness key is (tenant_id, llm_factory, llm_name) — WITHOUT
# model_type — so if a model name appears in both the department chat list and
# the global aux config under the same factory, they collapse into one row and
# the two tokens overwrite each other (the reported "all models use the
# department token" bug). Keeping department chat under a separate factory makes
# the two row sets disjoint. "VLLM" resolves to the same OpenAI-compatible
# ChatModel implementation (identical runtime behavior) and is a real factory in
# FACTORY_LLM_INFOS, so "<name>@VLLM" references still parse.
DEPARTMENT_CHAT_FACTORY = "VLLM"
DEFAULT_MAX_TOKENS = 8192

# Tool-calling switch for department-provisioned chat models. These are
# OpenAI-compatible models (served via New API) and virtually all modern ones
# support function/tool calling, which the agent canvas relies on (Retrieval,
# CodeExec, etc.). Keep this True so re-provisioning does NOT silently disable
# agent tools — otherwise is_tools gets re-encoded as False on every sync and
# the model starts narrating tool calls as plain text instead of executing them.
# If a specific model truly lacks tool support the worst case is graceful
# degradation (narration), not a crash. Flip to False only if you must globally
# disable tools for all department chat models.
DEPARTMENT_CHAT_IS_TOOLS = True

# Admin-assigned capability tags for a department model. Pure classification
# metadata (display/grouping); does not change how models are provisioned.
# web_search  -> runtime injects Bailian/Qwen `enable_search` (model built-in web search)
# fast_reply  -> exposes the chat "fast reply / default" choice to users for this model
VALID_MODEL_TYPES = ("web_search", "image_parse", "multimodal", "fast_reply")


def _parse_model_types(raw):
    """Comma-separated tag string -> ordered list of valid, de-duplicated tags."""
    result = []
    for t in (raw or "").split(","):
        t = t.strip()
        if t in VALID_MODEL_TYPES and t not in result:
            result.append(t)
    return result


def _serialize_model_types(values):
    """List of tags -> canonical comma-separated string (valid + de-duplicated)."""
    result = []
    for t in values or []:
        t = str(t).strip()
        if t in VALID_MODEL_TYPES and t not in result:
            result.append(t)
    return ",".join(result)


def fetch_models(api_base, api_key):
    """
    Call the provider's OpenAI-compatible ``GET {api_base}/models`` and return a
    sorted list of model name strings. Tolerates the standard ``{"data": [...]}``
    envelope as well as a bare list.
    """
    if not api_base:
        raise ValueError("api_base is required.")
    url = f"{str(api_base).rstrip('/')}/models"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    resp = sync_request("GET", url, headers=headers, timeout=15)
    resp.raise_for_status()
    payload = resp.json()

    items = payload.get("data", payload) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ValueError("Unexpected /models response format.")

    names = []
    for item in items:
        if isinstance(item, dict):
            name = item.get("id") or item.get("name")
        else:
            name = item
        if name:
            names.append(str(name))
    return sorted(set(names))


class DepartmentLLMService(CommonService):
    model = DepartmentLLM


class DepartmentLLMModelService(CommonService):
    model = DepartmentLLMModel


def _upsert_user_model(user_id, api_base, api_key, llm_name):
    """Insert/update one OpenAI-compatible chat model on a user's tenant."""
    encoded_key = TenantLLMService._encode_api_key_config(api_key or "", DEPARTMENT_CHAT_IS_TOOLS)
    row = {
        "tenant_id": user_id,
        "llm_factory": DEPARTMENT_CHAT_FACTORY,
        "model_type": LLMType.CHAT.value,
        "llm_name": llm_name,
        "api_key": encoded_key,
        "api_base": api_base or "",
        "max_tokens": DEFAULT_MAX_TOKENS,
    }
    updated = TenantLLMService.filter_update(
        [
            TenantLLM.tenant_id == user_id,
            TenantLLM.llm_factory == DEPARTMENT_CHAT_FACTORY,
            TenantLLM.llm_name == llm_name,
        ],
        row,
    )
    if not updated:
        TenantLLMService.save(**row)


def _remove_user_model(user_id, llm_name):
    TenantLLMService.filter_delete(
        [
            TenantLLM.tenant_id == user_id,
            TenantLLM.llm_factory == DEPARTMENT_CHAT_FACTORY,
            TenantLLM.llm_name == llm_name,
        ]
    )


def apply_department_models_to_user(user_id, department_id):
    """
    Provision the department's enabled models onto one user's tenant, and remove
    the disabled ones. No-op when the department has no token configured.
    """
    if not user_id or not department_id:
        return
    token = DepartmentLLMService.get_or_none(department_id=department_id)
    if not token:
        return
    models = DepartmentLLMModelService.query(department_id=department_id)
    for m in models:
        if m.enabled:
            _upsert_user_model(user_id, token.api_base, token.api_key, m.llm_name)
        else:
            _remove_user_model(user_id, m.llm_name)


def apply_department_models_to_all_users(department_id):
    """Re-provision the department's models onto every user in the department."""
    users = UserService.query(department_id=department_id)
    for user in users:
        apply_department_models_to_user(user.id, department_id)


@DB.connection_context()
def get_models_by_tenants():
    """Return {tenant_id: [llm_name, ...]} of department chat models for all tenants."""
    rows = TenantLLM.select(TenantLLM.tenant_id, TenantLLM.llm_name).where(
        TenantLLM.llm_factory == DEPARTMENT_CHAT_FACTORY,
        ~TenantLLM.api_key.is_null(),
    )
    result = {}
    for r in rows:
        result.setdefault(r.tenant_id, []).append(r.llm_name)
    for names in result.values():
        names.sort()
    return result


def get_configured_department_ids():
    """Return the set of department ids that have a model token configured."""
    return {t.department_id for t in DepartmentLLMService.get_all()}


@DB.connection_context()
def _user_model_names(user_id):
    rows = TenantLLM.select(TenantLLM.llm_name).where(
        TenantLLM.tenant_id == user_id,
        TenantLLM.llm_factory == DEPARTMENT_CHAT_FACTORY,
        ~TenantLLM.api_key.is_null(),
    )
    return {r.llm_name for r in rows}


def get_user_llm_config(email):
    """
    Return one user's model catalog with per-model on/off reflecting whether the
    user currently has each model. The catalog = the user's department models
    (the source of the token) unioned with any models the user already has.
    """
    users = UserService.query(email=email)
    if not users:
        raise ValueError(f"User not found: {email}")
    user = users[0]
    dept_id = getattr(user, "department_id", None)

    token = DepartmentLLMService.get_or_none(department_id=dept_id) if dept_id else None
    dept_models = DepartmentLLMModelService.query(department_id=dept_id) if dept_id else []
    user_models = _user_model_names(user.id)

    names = {m.llm_name for m in dept_models} | user_models
    models = [{"llm_name": n, "enabled": n in user_models} for n in sorted(names)]
    return {
        "email": user.email,
        "nickname": user.nickname,
        "department_id": dept_id,
        "api_base": token.api_base if token else "",
        "has_token": bool(token),
        "models": models,
    }


@DB.connection_context()
def save_user_llm_config(email, models):
    """Apply a per-user model on/off list onto that single user's tenant."""
    users = UserService.query(email=email)
    if not users:
        raise ValueError(f"User not found: {email}")
    user = users[0]
    dept_id = getattr(user, "department_id", None)
    token = DepartmentLLMService.get_or_none(department_id=dept_id) if dept_id else None
    api_base = token.api_base if token else ""
    api_key = token.api_key if token else ""

    enabled_n = 0
    disabled_n = 0
    for m in models or []:
        name = (m.get("llm_name") or "").strip()
        if not name:
            continue
        if bool(m.get("enabled", False)):
            _upsert_user_model(user.id, api_base, api_key, name)
            enabled_n += 1
        else:
            _remove_user_model(user.id, name)
            disabled_n += 1
    return {"models_enabled": enabled_n, "models_disabled": disabled_n}


@DB.connection_context()
def save_department_config(department_id, api_base, api_key, models):
    """
    Save a department's token (api_base/api_key) and its model on/off list, then
    push the result to every user in the department.

    :param models: list of {"llm_name": str, "enabled": bool}
    :return: stats dict
    """
    # 1. Upsert the department token
    token = DepartmentLLMService.get_or_none(department_id=department_id)
    if token:
        DepartmentLLMService.update_by_id(
            token.id, {"api_base": api_base or "", "api_key": api_key or ""}
        )
    else:
        DepartmentLLMService.insert(
            id=get_uuid(),
            department_id=department_id,
            api_base=api_base or "",
            api_key=api_key or "",
            status=StatusEnum.VALID.value,
        )

    # 2. Reconcile the department's model rows
    incoming = {}
    for m in models or []:
        name = (m.get("llm_name") or "").strip()
        if name:
            incoming[name] = {
                "enabled": bool(m.get("enabled", True)),
                "model_types": _serialize_model_types(m.get("model_types")),
            }

    existing = {m.llm_name: m for m in DepartmentLLMModelService.query(department_id=department_id)}

    for name, spec in incoming.items():
        row = existing.get(name)
        if row:
            DepartmentLLMModelService.update_by_id(
                row.id,
                {"enabled": spec["enabled"], "model_types": spec["model_types"]},
            )
        else:
            DepartmentLLMModelService.insert(
                id=get_uuid(),
                department_id=department_id,
                llm_name=name,
                enabled=spec["enabled"],
                model_types=spec["model_types"],
                status=StatusEnum.VALID.value,
            )

    # 3. Drop models removed from the config (also from users)
    removed = set(existing.keys()) - set(incoming.keys())
    users = UserService.query(department_id=department_id)
    for name in removed:
        DepartmentLLMModelService.delete_by_id(existing[name].id)
        for user in users:
            _remove_user_model(user.id, name)

    # 4. Push current config to all department users
    apply_department_models_to_all_users(department_id)

    return {
        "users": len(users),
        "models_enabled": sum(1 for s in incoming.values() if s["enabled"]),
        "models_disabled": sum(1 for s in incoming.values() if not s["enabled"]),
        "models_removed": len(removed),
    }


@DB.connection_context()
def resync_department_models(department_id):
    """
    Re-pull ``/models`` using the department's saved token and reconcile its model
    list: add new models (enabled), drop models the provider no longer returns
    (also from users), keep the on/off state of retained models, then re-apply to
    all department users.
    """
    token = DepartmentLLMService.get_or_none(department_id=department_id)
    if not token or not token.api_base:
        return {"skipped": True, "added": 0, "removed": 0, "total": 0, "users": 0}

    names = fetch_models(token.api_base, token.api_key)
    existing = {m.llm_name: m for m in DepartmentLLMModelService.query(department_id=department_id)}
    users = UserService.query(department_id=department_id)

    added = 0
    for name in names:
        if name not in existing:
            DepartmentLLMModelService.insert(
                id=get_uuid(),
                department_id=department_id,
                llm_name=name,
                enabled=True,
                status=StatusEnum.VALID.value,
            )
            added += 1

    removed = set(existing.keys()) - set(names)
    for name in removed:
        DepartmentLLMModelService.delete_by_id(existing[name].id)
        for user in users:
            _remove_user_model(user.id, name)

    apply_department_models_to_all_users(department_id)
    return {"added": added, "removed": len(removed), "total": len(names), "users": len(users)}


def resync_all_department_models():
    """Re-sync every configured department's models from its provider."""
    stats = {"departments": 0, "added": 0, "removed": 0, "failed": 0}
    for token in DepartmentLLMService.get_all():
        stats["departments"] += 1
        try:
            r = resync_department_models(token.department_id)
            stats["added"] += r.get("added", 0)
            stats["removed"] += r.get("removed", 0)
        except Exception:
            logging.exception(f"Failed to resync models for department {token.department_id}")
            stats["failed"] += 1
    return stats


def get_department_config(department_id):
    """Return the saved token + model list for a department."""
    token = DepartmentLLMService.get_or_none(department_id=department_id)
    models = DepartmentLLMModelService.query(department_id=department_id)
    return {
        "department_id": department_id,
        "api_base": token.api_base if token else "",
        "api_key": token.api_key if token else "",
        "models": sorted(
            [
                {
                    "llm_name": m.llm_name,
                    "enabled": bool(m.enabled),
                    "model_types": _parse_model_types(getattr(m, "model_types", "")),
                }
                for m in models
            ],
            key=lambda x: x["llm_name"],
        ),
    }


def list_department_configs():
    """
    Return every department that has a model token configured, each with its
    department name, api_base and full model on/off list. Used by the admin
    "model settings" overview. api_key is intentionally omitted (never exposed).
    """
    from api.db.services.department_service import DepartmentService

    dept_names = {d.id: d.name for d in DepartmentService.get_all()}
    result = []
    for token in DepartmentLLMService.get_all():
        models = DepartmentLLMModelService.query(department_id=token.department_id)
        model_list = sorted(
            [
                {
                    "llm_name": m.llm_name,
                    "enabled": bool(m.enabled),
                    "model_types": _parse_model_types(getattr(m, "model_types", "")),
                }
                for m in models
            ],
            key=lambda x: x["llm_name"],
        )
        result.append(
            {
                "department_id": token.department_id,
                "department_name": dept_names.get(token.department_id, token.department_id),
                "api_base": token.api_base or "",
                "enabled_count": sum(1 for m in model_list if m["enabled"]),
                "total_count": len(model_list),
                "models": model_list,
            }
        )
    result.sort(key=lambda x: x["department_name"] or "")
    return result
