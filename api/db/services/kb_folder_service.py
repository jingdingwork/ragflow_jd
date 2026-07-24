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
"""Virtual-folder orchestration for knowledge bases.

Combines two stores into one folder view:

- the ``KbFolder`` registry table — folders that must persist without any
  document (explicitly created empty folders, and their ancestors), and
- the reserved ``_folder`` document metadata — actual document membership.

The registry is only consulted/updated for folder *existence*; document
counts and re-parenting flow through :class:`DocMetadataService`.
"""

import logging

from api.db.db_models import DB, KbFolder
from api.db.services.doc_metadata_service import DocMetadataService
from common.folder_utils import normalize_folder_path
from common.misc_utils import get_uuid


class FolderError(Exception):
    """Raised for invalid folder operations (bad path, collision, non-empty delete)."""


def _self_and_ancestors(path: str) -> list[str]:
    """``"a/b/c"`` -> ``["a", "a/b", "a/b/c"]``. Empty path -> ``[]``."""
    if not path:
        return []
    parts = path.split("/")
    return ["/".join(parts[: i + 1]) for i in range(len(parts))]


class KbFolderService:
    @classmethod
    @DB.connection_context()
    def _registry_paths(cls, kb_id: str) -> set[str]:
        rows = KbFolder.select(KbFolder.path).where(KbFolder.kb_id == kb_id)
        return {r.path for r in rows}

    @classmethod
    def list_tree(cls, kb_id: str) -> list[dict]:
        """Return every folder in the KB as ``{path, name, count}`` nodes.

        ``count`` is the number of documents whose folder is exactly that path
        (not recursive); frontend rolls up totals. The set is the union of
        registry folders, folders implied by document metadata, and all their
        ancestors, so intermediate folders always appear.
        """
        counts = DocMetadataService.get_folder_counts(kb_id)
        leaf_paths = set(counts) | cls._registry_paths(kb_id)

        full: set[str] = set()
        for p in leaf_paths:
            full.update(_self_and_ancestors(p))

        nodes = [
            {"path": p, "name": p.rsplit("/", 1)[-1], "count": counts.get(p, 0)}
            for p in sorted(full)
        ]
        return nodes

    @classmethod
    @DB.connection_context()
    def create(cls, kb_id: str, path: str, user_id: str) -> str:
        """Create a folder (and any missing ancestors) in the registry.

        Idempotent: existing folders are left untouched. Returns the
        normalized path.
        """
        norm = normalize_folder_path(path)
        if not norm:
            raise FolderError("Folder name cannot be empty.")

        existing = cls._registry_paths(kb_id)
        for p in _self_and_ancestors(norm):
            if p not in existing:
                KbFolder.create(id=get_uuid(), kb_id=kb_id, path=p, created_by=user_id)
        return norm

    @classmethod
    @DB.connection_context()
    def rename(cls, kb_id: str, old_path: str, new_path: str, user_id: str) -> int:
        """Rename/move a folder subtree. Returns the number of documents moved.

        Rewrites both registry rows and document ``_folder`` metadata under
        ``old_path``. Rejects renaming into the folder's own subtree (would
        create a cycle) and collisions with an existing sibling folder.
        """
        old = normalize_folder_path(old_path)
        new = normalize_folder_path(new_path)
        if not old:
            raise FolderError("Source folder is invalid.")
        if not new:
            raise FolderError("Target folder name cannot be empty.")
        if new == old:
            return 0
        if new.startswith(old + "/"):
            raise FolderError("Cannot move a folder into itself.")

        existing = cls._registry_paths(kb_id)
        counts = DocMetadataService.get_folder_counts(kb_id)
        all_paths = existing | set(counts)
        # Collision: target already exists as a distinct folder.
        if new in all_paths or any(p == new or p.startswith(new + "/") for p in all_paths):
            raise FolderError("A folder with the target name already exists.")

        # Rewrite registry rows for the subtree.
        for p in list(existing):
            if p == old:
                new_p = new
            elif p.startswith(old + "/"):
                new_p = new + p[len(old):]
            else:
                continue
            KbFolder.update(path=new_p).where(
                (KbFolder.kb_id == kb_id) & (KbFolder.path == p)
            ).execute()
        # Ensure ancestors of the new path exist.
        cls.create(kb_id, new, user_id)

        return DocMetadataService.rename_folder(kb_id, old, new)

    @classmethod
    def delete(cls, kb_id: str, path: str, tenant_id: str) -> int:
        """Delete a folder subtree together with every document under it.

        All documents in the folder and its descendants are removed via
        ``FileService.delete_docs`` — the same full cleanup as deleting a
        document from the UI (chunks/embeddings in the doc store, storage
        blobs, thumbnails, tasks, ``_folder`` metadata, knowledge-graph refs
        and KB counts). The registry rows for the subtree are then removed.
        Returns the number of documents deleted.
        """
        norm = normalize_folder_path(path)
        if not norm:
            raise FolderError("Folder is invalid.")

        doc_ids = DocMetadataService.get_doc_ids_by_folder(kb_id, norm, recursive=True)
        if doc_ids:
            # Local import avoids a module-level cycle (FileService pulls in
            # KnowledgebaseService/DocumentService which reference this layer).
            from api.db.services.file_service import FileService

            errors = FileService.delete_docs(doc_ids, tenant_id)
            if errors:
                raise FolderError(str(errors))

        with DB.connection_context():
            KbFolder.delete().where(
                (KbFolder.kb_id == kb_id)
                & ((KbFolder.path == norm) | (KbFolder.path.startswith(norm + "/")))
            ).execute()
        return len(doc_ids)

    @classmethod
    def move_documents(cls, kb_id: str, doc_ids: list[str], target_path: str, user_id: str) -> int:
        """Re-parent documents into ``target_path`` (blank = root). Returns count moved."""
        target = normalize_folder_path(target_path)
        if target:
            # Persist the target folder so it survives even if the move is undone.
            cls.create(kb_id, target, user_id)
        moved = 0
        for doc_id in doc_ids or []:
            if DocMetadataService.set_document_folder(doc_id, target):
                moved += 1
        return moved
