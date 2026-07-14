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
from peewee import fn

from api.db.db_models import DB, ModelCatalog
from api.db.services.common_service import CommonService
from api.db.services.department_llm_service import (
    VALID_MODEL_TYPES,
    _parse_model_types,
    _serialize_model_types,
)
from common.constants import StatusEnum
from common.misc_utils import get_uuid

# Seeded when the catalog is empty so the admin has a starting list to edit.
DEFAULT_CATALOG = [
    ("Qwen3-4B", []),
    ("deepseek-v4-pro", []),
    ("glm-5.2", []),
    ("kimi-k2.6", []),
    ("qwen3-vl-32b-thinking", ["image_parse", "multimodal"]),
    ("qwen3.7-max", []),
]


class ModelCatalogService(CommonService):
    model = ModelCatalog


def _clean_custom_tags(values):
    """Trim, drop empties, de-duplicate free-form tags; cap length defensively."""
    result = []
    for t in values or []:
        t = str(t).strip()[:64]
        if t and t not in result:
            result.append(t)
    return result


def _to_dict(row):
    return {
        "id": row.id,
        "llm_name": row.llm_name,
        "capabilities": _parse_model_types(getattr(row, "capabilities", "")),
        "custom_tags": list(getattr(row, "custom_tags", None) or []),
        "sort": getattr(row, "sort", 0) or 0,
    }


@DB.connection_context()
def _seed_if_empty():
    if ModelCatalogService.model.select().count() > 0:
        return
    for idx, (name, caps) in enumerate(DEFAULT_CATALOG):
        ModelCatalogService.insert(
            id=get_uuid(),
            llm_name=name,
            capabilities=_serialize_model_types(caps),
            custom_tags=[],
            sort=idx,
            status=StatusEnum.VALID.value,
        )


def list_models():
    """Return the full catalog (seeding defaults on first access)."""
    _seed_if_empty()
    rows = ModelCatalogService.model.select().order_by(
        ModelCatalog.sort.asc(), ModelCatalog.llm_name.asc()
    )
    return [_to_dict(r) for r in rows]


@DB.connection_context()
def get_public_catalog():
    """Read-only catalog (no seeding); safe for user-side tag display."""
    rows = ModelCatalogService.model.select().order_by(
        ModelCatalog.sort.asc(), ModelCatalog.llm_name.asc()
    )
    return [_to_dict(r) for r in rows]


@DB.connection_context()
def get_capabilities_by_name(llm_name: str) -> set:
    """Return the set of capability tags configured for a model in the catalog.

    Matched by bare model name (case-insensitive). The runtime chat name may carry a
    ``name@factory`` suffix, so we strip it before matching. Returns an empty set when
    the model is not catalogued, so callers can treat "no config" as "no capability".
    """
    name = (llm_name or "").strip()
    if not name:
        return set()
    name = name.split("@")[0].strip()
    row = (
        ModelCatalogService.model.select(ModelCatalog.capabilities)
        .where(fn.LOWER(ModelCatalog.llm_name) == name.lower())
        .first()
    )
    if not row:
        return set()
    return set(_parse_model_types(getattr(row, "capabilities", "")))


def create_model(llm_name, capabilities, custom_tags):
    name = (llm_name or "").strip()
    if not name:
        raise ValueError("Model name is required.")
    if ModelCatalogService.model.select().where(ModelCatalog.llm_name == name).exists():
        raise ValueError(f"Model already exists: {name}")
    max_sort = 0
    for r in ModelCatalogService.model.select(ModelCatalog.sort):
        max_sort = max(max_sort, r.sort or 0)
    row_id = get_uuid()
    ModelCatalogService.insert(
        id=row_id,
        llm_name=name,
        capabilities=_serialize_model_types(capabilities),
        custom_tags=_clean_custom_tags(custom_tags),
        sort=max_sort + 1,
        status=StatusEnum.VALID.value,
    )
    return _to_dict(ModelCatalogService.get_or_none(id=row_id))


def update_model(catalog_id, llm_name, capabilities, custom_tags):
    row = ModelCatalogService.get_or_none(id=catalog_id)
    if not row:
        raise ValueError(f"Model not found: {catalog_id}")
    patch = {
        "capabilities": _serialize_model_types(capabilities),
        "custom_tags": _clean_custom_tags(custom_tags),
    }
    name = (llm_name or "").strip()
    if name and name != row.llm_name:
        if ModelCatalogService.model.select().where(ModelCatalog.llm_name == name).exists():
            raise ValueError(f"Model already exists: {name}")
        patch["llm_name"] = name
    ModelCatalogService.update_by_id(catalog_id, patch)
    return _to_dict(ModelCatalogService.get_or_none(id=catalog_id))


def delete_model(catalog_id):
    row = ModelCatalogService.get_or_none(id=catalog_id)
    if not row:
        raise ValueError(f"Model not found: {catalog_id}")
    ModelCatalogService.delete_by_id(catalog_id)
    return {"deleted": catalog_id}


# Re-exported so callers can validate against the same tag vocabulary.
__all__ = [
    "ModelCatalogService",
    "list_models",
    "create_model",
    "update_model",
    "delete_model",
    "VALID_MODEL_TYPES",
]
