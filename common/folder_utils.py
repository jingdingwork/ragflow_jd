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
"""Virtual-folder path helpers for knowledge-base documents.

A document's folder is stored as the reserved ``_folder`` metadata key
(:data:`common.constants.DOC_FOLDER_META_KEY`). These helpers normalise
user/browser-supplied paths into a canonical form:

- forward-slash separators, no leading/trailing slash, no blank segments
- ``.`` / ``..`` segments dropped so a path can never escape its KB
- Unicode preserved (unlike ``api.utils.file_utils.sanitize_path``, which is
  ASCII-only because it builds object-storage keys) so ``合同/2024`` survives
- per-segment length cap to keep values index-friendly

The canonical empty path ``""`` means "knowledge-base root".
"""

from __future__ import annotations

# Segments longer than this are truncated; a defensive bound so a pathological
# browser path can't blow up the metadata index. Generous enough for real
# folder names.
_MAX_SEGMENT_LEN = 255
# Cap on folder depth so a crafted deep path can't produce an unbounded key.
_MAX_DEPTH = 32


def normalize_folder_path(raw_path: str | None) -> str:
    """Return a canonical folder path, or ``""`` for root / invalid input.

    Accepts either ``/`` or ``\\`` separators. Whitespace-only or ``None``
    input yields ``""``.
    """
    if not raw_path or not isinstance(raw_path, str):
        return ""

    normalized = raw_path.replace("\\", "/")
    parts: list[str] = []
    for seg in normalized.split("/"):
        seg = seg.strip()
        if not seg or seg in (".", ".."):
            continue
        if len(seg) > _MAX_SEGMENT_LEN:
            seg = seg[:_MAX_SEGMENT_LEN]
        parts.append(seg)
        if len(parts) >= _MAX_DEPTH:
            break
    return "/".join(parts)


def folder_from_relative_path(relative_path: str | None) -> str:
    """Extract the folder (directory) portion of a browser relative path.

    ``webkitRelativePath`` looks like ``root/sub/file.pdf``; the folder is
    everything before the final segment. A bare filename (or empty input)
    resolves to root (``""``).
    """
    if not relative_path or not isinstance(relative_path, str):
        return ""
    normalized = relative_path.replace("\\", "/")
    idx = normalized.rfind("/")
    if idx < 0:
        return ""
    return normalize_folder_path(normalized[:idx])


def is_subpath(folder: str, ancestor: str) -> bool:
    """True when ``folder`` equals ``ancestor`` or lies beneath it.

    Both arguments are assumed already normalised. An empty ``ancestor``
    (root) contains every folder.
    """
    if not ancestor:
        return True
    return folder == ancestor or folder.startswith(ancestor + "/")
