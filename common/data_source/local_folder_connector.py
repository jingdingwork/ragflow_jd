"""Local folder (mounted share) connector.

Reads files from a directory the host has already mounted -- e.g. an SMB/CIFS or
NFS share bind-mounted into the container. The OS mount handles authentication,
so ``load_credentials`` is a no-op and no secrets are stored in the connector
config.

The contract mirrors the WebDAV connector so the sync engine
(``rag/svr/sync_data_source.py``) drives it unchanged. In particular the
per-file stable id (``local_folder:<relative-path>``) is reused between the
document yields and the slim snapshot, so the engine's stale-document
reconciliation (delete sync) lines up correctly.
"""
import logging
import os
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from common.data_source.config import (
    BLOB_STORAGE_SIZE_THRESHOLD,
    INDEX_BATCH_SIZE,
    DocumentSource,
)
from common.data_source.exceptions import (
    ConnectorValidationError,
    InsufficientPermissionsError,
)
from common.data_source.interfaces import (
    LoadConnector,
    OnyxExtensionType,
    PollConnector,
    SlimConnectorWithPermSync,
)
from common.data_source.models import (
    Document,
    GenerateDocumentsOutput,
    GenerateSlimDocumentOutput,
    SecondsSinceUnixEpoch,
    SlimDocument,
)
from common.data_source.utils import get_file_ext, is_accepted_file_ext


class LocalFolderConnector(LoadConnector, PollConnector, SlimConnectorWithPermSync):
    """Sync files from a locally-mounted folder (mounted SMB/NFS share)."""

    # Directory names skipped by default: shared-drive recycle bins and temp dirs
    # whose contents should never reach the knowledge base.
    DEFAULT_EXCLUDE_DIRS = {"#recycle", ".recycle", "$recycle.bin", ".~tmp", ".tmp"}

    def __init__(
        self,
        root_path: str,
        recursive: bool = True,
        batch_size: int = INDEX_BATCH_SIZE,
        exclude_dirs: Optional[list[str]] = None,
    ) -> None:
        self.root_path = os.path.abspath(root_path) if root_path else ""
        self.recursive = bool(recursive)
        self.batch_size = batch_size
        self._allow_images: bool | None = None
        self.size_threshold: int | None = BLOB_STORAGE_SIZE_THRESHOLD
        # Case-insensitive match on directory basename.
        extra = {d.strip().lower() for d in (exclude_dirs or []) if d and d.strip()}
        self.exclude_dirs = {d.lower() for d in self.DEFAULT_EXCLUDE_DIRS} | extra

    def _build_extension_type(self) -> OnyxExtensionType:
        extension_type = OnyxExtensionType.Plain | OnyxExtensionType.Document
        if bool(self._allow_images):
            extension_type |= OnyxExtensionType.Multimedia
        return extension_type

    def _is_supported_file(self, file_name: str) -> bool:
        return is_accepted_file_ext(get_file_ext(file_name), self._build_extension_type())

    def set_allow_images(self, allow_images: bool) -> None:
        self._allow_images = allow_images

    def load_credentials(self, credentials: dict[str, Any]) -> dict[str, Any] | None:
        # The OS mount handles authentication; nothing to load here.
        return None

    def _stable_id(self, rel_path: str) -> str:
        """Stable per-file id reused by document yields and the slim snapshot.

        Forward-slash relative path keeps ids identical across runs (and OSes)
        so the engine's delete reconciliation matches.
        """
        return f"local_folder:{rel_path}"

    def _rel_path(self, abs_path: str) -> str:
        return os.path.relpath(abs_path, self.root_path).replace(os.sep, "/")

    def _is_excluded_dir(self, name: str) -> bool:
        return name.lower() in self.exclude_dirs

    def _iter_files(self) -> Iterator[tuple[str, str, os.stat_result]]:
        """Yield ``(abs_path, rel_path, stat_result)`` for every supported file."""
        if self.recursive:
            walker = os.walk(self.root_path)
        else:
            try:
                names = os.listdir(self.root_path)
            except OSError as e:
                logging.warning("LocalFolder: cannot list %s: %s", self.root_path, e)
                names = []
            walker = [(self.root_path, [], names)]

        for dir_path, dirnames, filenames in walker:
            # Prune excluded directories in-place so os.walk won't descend into them.
            dirnames[:] = [d for d in dirnames if not self._is_excluded_dir(d)]
            # Skip files that sit directly under an excluded directory (covers the
            # non-recursive listdir branch and any excluded root-level dir).
            if any(self._is_excluded_dir(part) for part in self._rel_path(dir_path).split("/")):
                continue
            for file_name in filenames:
                if not self._is_supported_file(file_name):
                    continue
                abs_path = os.path.join(dir_path, file_name)
                if not os.path.isfile(abs_path):
                    continue
                try:
                    st = os.stat(abs_path)
                except OSError as e:
                    logging.warning("LocalFolder: cannot stat %s: %s", abs_path, e)
                    continue
                yield abs_path, self._rel_path(abs_path), st

    def _yield_documents(self, start: datetime, end: datetime) -> GenerateDocumentsOutput:
        files = list(self._iter_files())

        # Fall back to relative-path names only where basenames collide.
        basename_counts: dict[str, int] = {}
        for _abs, rel, _st in files:
            base = os.path.basename(rel)
            basename_counts[base] = basename_counts.get(base, 0) + 1

        batch: list[Document] = []
        for abs_path, rel_path, st in files:
            modified = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
            if not (start < modified <= end):
                continue

            size_bytes = st.st_size
            if (
                self.size_threshold is not None
                and size_bytes > self.size_threshold
            ):
                logging.warning(
                    "LocalFolder: %s (%d bytes) exceeds size threshold; skipping.",
                    rel_path,
                    size_bytes,
                )
                continue

            try:
                with open(abs_path, "rb") as fh:
                    blob = fh.read()
            except OSError as e:
                logging.exception("LocalFolder: failed to read %s: %s", abs_path, e)
                continue

            if not blob:
                logging.warning("LocalFolder: empty file %s; skipping.", rel_path)
                continue

            base = os.path.basename(rel_path)
            semantic_id = rel_path.replace("/", " / ") if basename_counts.get(base, 0) > 1 else base

            batch.append(
                Document(
                    id=self._stable_id(rel_path),
                    blob=blob,
                    source=DocumentSource.LOCAL_FOLDER,
                    semantic_identifier=semantic_id,
                    extension=get_file_ext(base),
                    doc_updated_at=modified,
                    size_bytes=size_bytes,
                )
            )
            if len(batch) >= self.batch_size:
                yield batch
                batch = []

        if batch:
            yield batch

    def load_from_state(self) -> GenerateDocumentsOutput:
        self._ensure_accessible()
        logging.info("LocalFolder: full load from %s", self.root_path)
        return self._yield_documents(
            start=datetime(1970, 1, 1, tzinfo=timezone.utc),
            end=datetime.now(timezone.utc),
        )

    def poll_source(
        self, start: SecondsSinceUnixEpoch, end: SecondsSinceUnixEpoch
    ) -> GenerateDocumentsOutput:
        self._ensure_accessible()
        start_dt = datetime.fromtimestamp(start, tz=timezone.utc)
        end_dt = datetime.fromtimestamp(end, tz=timezone.utc)
        for batch in self._yield_documents(start_dt, end_dt):
            yield batch

    def retrieve_all_slim_docs_perm_sync(
        self,
        callback: Any = None,
    ) -> GenerateSlimDocumentOutput:
        """Full snapshot of current file ids for stale-document reconciliation.

        Uses the same ``local_folder:<rel-path>`` ids as the document yields,
        without reading file contents.
        """
        del callback
        self._ensure_accessible()

        batch: list[SlimDocument] = []
        total = 0
        for _abs, rel_path, st in self._iter_files():
            if (
                self.size_threshold is not None
                and st.st_size > self.size_threshold
            ):
                # Mirror the indexing filter: oversize files are never indexed,
                # so excluding them here avoids false-positive deletions.
                continue
            batch.append(SlimDocument(id=self._stable_id(rel_path)))
            total += 1
            if len(batch) >= self.batch_size:
                yield batch
                batch = []

        if batch:
            yield batch

        logging.info("LocalFolder slim snapshot: %d documents under %s", total, self.root_path)

    def count_supported_files(self) -> int:
        """Cheap preview used by the detection endpoint."""
        self._ensure_accessible()
        count = 0
        for _abs, _rel, st in self._iter_files():
            if (
                self.size_threshold is not None
                and st.st_size > self.size_threshold
            ):
                continue
            count += 1
        return count

    def _ensure_accessible(self) -> None:
        if not self.root_path:
            raise ConnectorValidationError("No folder path was provided.")
        if not os.path.exists(self.root_path):
            raise ConnectorValidationError(
                f"Path does not exist or is not mounted: {self.root_path}"
            )
        if not os.path.isdir(self.root_path):
            raise ConnectorValidationError(f"Path is not a directory: {self.root_path}")
        if not os.access(self.root_path, os.R_OK | os.X_OK):
            raise InsufficientPermissionsError(
                f"No read permission for folder: {self.root_path}"
            )

    def validate_connector_settings(self) -> None:
        self._ensure_accessible()
