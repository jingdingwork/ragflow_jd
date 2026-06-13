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

from api.db.db_models import DB, GlobalLLM, TenantLLM
from api.db.services.common_service import CommonService
from api.db.services.department_llm_service import (
    DEFAULT_MAX_TOKENS,
    OPENAI_COMPATIBLE_FACTORY,
    fetch_models,
)
from api.db.services.tenant_llm_service import TenantLLMService
from api.db.services.user_service import TenantService, UserService
from common.constants import LLMType, StatusEnum

# The single row holding the global config.
GLOBAL_ID = "global"

# Auxiliary model types the global config governs (chat/LLM is intentionally
# excluded — it is configured per department/user). Each maps to the GlobalLLM
# column holding the chosen model name and the Tenant default fields to write.
GLOBAL_TYPES = {
    LLMType.EMBEDDING.value: {"column": "embd_name", "id_field": "embd_id", "tenant_id_field": "tenant_embd_id"},
    LLMType.RERANK.value: {"column": "rerank_name", "id_field": "rerank_id", "tenant_id_field": "tenant_rerank_id"},
    LLMType.IMAGE2TEXT.value: {"column": "img2txt_name", "id_field": "img2txt_id", "tenant_id_field": "tenant_img2txt_id"},
    LLMType.SPEECH2TEXT.value: {"column": "asr_name", "id_field": "asr_id", "tenant_id_field": "tenant_asr_id"},
    LLMType.TTS.value: {"column": "tts_name", "id_field": "tts_id", "tenant_id_field": "tenant_tts_id"},
}


class GlobalLLMService(CommonService):
    model = GlobalLLM


def _register_tenant_model(tenant_id, api_base, api_key, llm_name, model_type):
    """
    Insert/update one OpenAI-compatible model of ``model_type`` on a tenant and
    return its TenantLLM row id (needed to link the tenant's default ``*_id``).
    """
    encoded_key = TenantLLMService._encode_api_key_config(api_key or "", False)
    row = {
        "tenant_id": tenant_id,
        "llm_factory": OPENAI_COMPATIBLE_FACTORY,
        "model_type": model_type,
        "llm_name": llm_name,
        "api_key": encoded_key,
        "api_base": api_base or "",
        "max_tokens": DEFAULT_MAX_TOKENS,
    }
    updated = TenantLLMService.filter_update(
        [
            TenantLLM.tenant_id == tenant_id,
            TenantLLM.llm_factory == OPENAI_COMPATIBLE_FACTORY,
            TenantLLM.llm_name == llm_name,
        ],
        row,
    )
    if not updated:
        TenantLLMService.save(**row)
    obj = TenantLLMService.get_api_key(tenant_id, llm_name, model_type)
    return obj.id if obj else None


def _global_token():
    return GlobalLLMService.get_or_none(id=GLOBAL_ID)


def _default_config_from_settings():
    """Current effective defaults from ``service_conf.yaml`` ``user_default_llm``
    (resolved into ``settings.*_CFG``), shaped like a global config so the admin
    dialog opens pre-filled with what the system is actually using instead of a
    blank form. ``api_base``/``api_key`` are taken from the first configured
    aux model (embedding first)."""
    from common import settings

    cfg_by_type = {
        LLMType.EMBEDDING.value: getattr(settings, "EMBEDDING_CFG", None),
        LLMType.RERANK.value: getattr(settings, "RERANK_CFG", None),
        LLMType.IMAGE2TEXT.value: getattr(settings, "IMAGE2TEXT_CFG", None),
        LLMType.SPEECH2TEXT.value: getattr(settings, "ASR_CFG", None),
        LLMType.TTS.value: getattr(settings, "TTS_CFG", None),
    }
    models, api_base, api_key = {}, "", ""
    for model_type in GLOBAL_TYPES:
        cfg = cfg_by_type.get(model_type)
        cfg = cfg if isinstance(cfg, dict) else {}
        # Stored as "<name>@<factory>"; the dialog manages bare names.
        name = (cfg.get("model") or "").split("@")[0].strip()
        models[model_type] = name
        if name and not api_base:
            api_base = (cfg.get("base_url") or "").strip()
            api_key = (cfg.get("api_key") or "").strip()
    return {"api_base": api_base, "api_key": api_key, "models": models}


def get_global_config():
    """Return the global config as a flat dict (api_base/api_key + per-type name).

    Prefers the saved singleton; when nothing meaningful has been saved yet,
    falls back to the current system defaults so the admin edits the existing
    setup rather than starting from scratch.
    """
    token = _global_token()
    if token:
        models = {mt: (getattr(token, meta["column"], "") or "") for mt, meta in GLOBAL_TYPES.items()}
        has_data = bool((token.api_base or "").strip()) or any(models.values())
        if has_data:
            return {
                "api_base": token.api_base or "",
                "api_key": token.api_key or "",
                "models": models,
            }
    return _default_config_from_settings()


def apply_global_models_to_user(user_id):
    """
    Provision every configured global model onto one user's tenant and set the
    tenant's default for that type. No-op when nothing is configured.
    """
    if not user_id:
        return
    token = _global_token()
    if not token:
        return

    update = {}
    for model_type, meta in GLOBAL_TYPES.items():
        name = (getattr(token, meta["column"], "") or "").strip()
        if not name:
            continue
        row_id = _register_tenant_model(user_id, token.api_base, token.api_key, name, model_type)
        # Tenant stores the model id as "<name>@<factory>"; the *_id integer links
        # straight to the tenant_llm row.
        update[meta["id_field"]] = f"{name}@{OPENAI_COMPATIBLE_FACTORY}"
        if row_id is not None:
            update[meta["tenant_id_field"]] = row_id
    if update:
        TenantService.update_by_id(user_id, update)


def apply_global_models_to_all_users():
    """Re-provision the global models onto every user's tenant."""
    count = 0
    for user in UserService.get_all_users():
        try:
            apply_global_models_to_user(user.id)
            count += 1
        except Exception:
            logging.exception(f"Failed to apply global models to user {getattr(user, 'email', None)}")
    return count


@DB.connection_context()
def save_global_config(api_base, api_key, models):
    """
    Upsert the singleton global config and push it to every user's tenant.

    :param models: dict {model_type: llm_name}; only the keys in GLOBAL_TYPES are
        honored, an empty/missing value clears that type's selection.
    :return: stats dict
    """
    patch = {"api_base": api_base or "", "api_key": api_key or ""}
    configured = 0
    for model_type, meta in GLOBAL_TYPES.items():
        name = ((models or {}).get(model_type) or "").strip()
        patch[meta["column"]] = name
        if name:
            configured += 1

    token = _global_token()
    if token:
        GlobalLLMService.update_by_id(GLOBAL_ID, patch)
    else:
        GlobalLLMService.insert(id=GLOBAL_ID, status=StatusEnum.VALID.value, **patch)

    users = apply_global_models_to_all_users()
    return {"users": users, "models_configured": configured}
