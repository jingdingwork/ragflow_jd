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

from api.db.db_models import DB, Department
from api.db.services.common_service import CommonService
from common.constants import StatusEnum
from common.http_client import sync_request
from common.misc_utils import get_uuid
from common import settings

# Separator used to build a department's unique path_key from its top-down OU chain.
PATH_SEP = "/"

# Departments (first OU) excluded from sync: WeChat, special accounts, project mailboxes.
# Compared case-insensitively against the user's leaf OU.
EXCLUDED_DEPARTMENTS = {"wechat", "特殊账号", "项目统一邮箱"}

# Display-name overrides for departments whose raw OU value (from the OIDC/LDAP
# DN) should always be shown under a friendlier brand name. Keyed by the raw OU
# value, compared case-insensitively. The department's ``path_key`` still uses
# the raw OU value, so matching stays stable; only the shown ``name`` is mapped.
# This is enforced on every sync/login, so it never gets overwritten back to the
# raw value ("JDEC" -> "京鼎").
DEPARTMENT_NAME_OVERRIDES = {"jdec": "京鼎"}


def resolve_department_name(raw_name):
    """Map a raw OU value to its display name via DEPARTMENT_NAME_OVERRIDES."""
    if not raw_name:
        return raw_name
    return DEPARTMENT_NAME_OVERRIDES.get(str(raw_name).strip().lower(), raw_name)


def is_excluded_department(name):
    """True if a department (leaf OU) name should be excluded from sync/cleanup."""
    return bool(name) and str(name).strip().lower() in EXCLUDED_DEPARTMENTS


def parse_ou_chain(dn):
    """
    Parse an LDAP distinguished name (DN) into a top-down list of OU names.

    Example:
        "CN=杨恒健,OU=资讯部AH00,OU=JDEC,DC=jdec,DC=com,DC=cn"
        -> ["JDEC", "资讯部AH00"]

    Only ``OU=`` components are kept; ``CN=`` (person) and ``DC=`` (domain) are
    ignored. The DN lists OUs leaf-first, so we reverse to get a top-down chain
    suitable for building a department tree. The first OU in the DN (the leaf)
    is therefore the user's direct department.
    """
    if not dn or not isinstance(dn, str):
        return []
    ous = []
    for component in dn.split(","):
        component = component.strip()
        if not component or "=" not in component:
            continue
        key, _, value = component.partition("=")
        if key.strip().upper() == "OU":
            value = value.strip()
            if value:
                ous.append(value)
    ous.reverse()  # DN is leaf-first; build top-down chain
    return ous


def parse_cn(dn):
    """Extract the ``CN=`` (common name / person name) value from a DN, or None."""
    if not dn or not isinstance(dn, str):
        return None
    for component in dn.split(","):
        component = component.strip()
        key, _, value = component.partition("=")
        if key.strip().upper() == "CN":
            value = value.strip()
            if value:
                return value
    return None


def _get_oidc_admin_config():
    """Return the OIDC channel config (issuer + client credentials) used for
    Keycloak Admin API access, or raise when none is configured."""
    for channel_cfg in (settings.OAUTH_CONFIG or {}).values():
        if isinstance(channel_cfg, dict) and channel_cfg.get("issuer"):
            return channel_cfg
    raise ValueError("No OIDC channel with an 'issuer' is configured under oauth settings.")


def fetch_keycloak_users(page_size=100):
    """
    Pull every realm user from the Keycloak Admin API and return a tuple
    ``(directory, all_emails)``:

    - ``directory``: ``{lowercased_email: {"email", "dn", "nickname", "username"}}``
      for users that have both an email and an ``LDAP_ENTRY_DN`` and are not in an
      excluded department (used for department/account sync).
    - ``all_emails``: the set of every lowercased email present in Keycloak,
      regardless of DN / excluded department. Used to detect departed users
      (local accounts whose email is in NO Keycloak user) without false positives.

    Nickname is taken from the DN's ``CN=`` (the AD display name), falling back to
    the Keycloak first/last name, username, then the email local part.

    Authenticates with the OIDC client's credentials via the ``client_credentials``
    grant, so the client must have its Service Account enabled with the
    realm-management ``view-users`` role.
    """
    config = _get_oidc_admin_config()
    issuer = str(config["issuer"]).rstrip("/")
    client_id = config["client_id"]
    client_secret = config["client_secret"]
    if "/realms/" not in issuer:
        raise ValueError(f"Unexpected issuer format (missing '/realms/'): {issuer}")
    base_url, realm = issuer.split("/realms/", 1)
    realm = realm.strip("/")
    token_url = f"{issuer}/protocol/openid-connect/token"
    users_url = f"{base_url}/admin/realms/{realm}/users"

    token_resp = sync_request(
        "POST",
        token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Accept": "application/json"},
        timeout=15,
    )
    token_resp.raise_for_status()
    access_token = token_resp.json().get("access_token")
    if not access_token:
        raise ValueError("Failed to obtain Keycloak admin token via client_credentials.")

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    directory = {}
    all_emails = set()
    first = 0
    while True:
        resp = sync_request(
            "GET",
            users_url,
            params={"first": first, "max": page_size, "briefRepresentation": "false"},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        for user in batch:
            email = (user.get("email") or "").strip()
            # Record every Keycloak email up front (no DN/exclusion filter) so
            # departed-user detection never false-positives on filtered users.
            if email:
                all_emails.add(email.lower())
            attrs = user.get("attributes") or {}
            dn_val = attrs.get("LDAP_ENTRY_DN") or attrs.get("ldap_entry_dn")
            if isinstance(dn_val, list):
                dn_val = dn_val[0] if dn_val else None
            if not email or not dn_val:
                continue
            # Skip excluded departments (WeChat / special accounts / project mailboxes)
            ou_chain = parse_ou_chain(dn_val)
            leaf = ou_chain[-1] if ou_chain else None
            if is_excluded_department(leaf):
                continue
            nickname = (
                parse_cn(dn_val)
                or " ".join(filter(None, [user.get("firstName"), user.get("lastName")])).strip()
                or user.get("username")
                or email.split("@")[0]
            )
            directory[email.lower()] = {"email": email, "dn": dn_val, "nickname": nickname, "username": user.get("username")}
        # Keycloak may return fewer than `max` on a page even when more users
        # remain, so advance by the actual batch size and keep paging until an
        # empty batch. (Breaking on a short page silently drops trailing users.)
        first += len(batch)
    return directory, all_emails


class DepartmentService(CommonService):
    """Service for managing departments derived from OIDC/LDAP user DNs."""

    model = Department

    @classmethod
    @DB.connection_context()
    def upsert_from_dn(cls, dn):
        """
        Upsert the full OU chain of ``dn`` into the department table and return
        the leaf department id (the user's direct department), or None when the
        DN carries no OU.

        Each level is identified by its ``path_key`` (the full top-down OU chain
        joined by ``PATH_SEP``), so re-running on the same DN is idempotent.
        """
        ou_chain = parse_ou_chain(dn)
        if not ou_chain:
            return None

        parent_id = None
        leaf_id = None
        path_parts = []
        for name in ou_chain:
            # path_key is always built from the raw OU chain so matching stays
            # stable; only the stored/display name is run through the override.
            path_parts.append(name)
            path_key = PATH_SEP.join(path_parts)
            display_name = resolve_department_name(name)
            is_overridden = display_name != name
            node = cls.get_or_none(path_key=path_key)
            if node is not None:
                node_id = node.id
                # Self-heal only overridden departments so their brand name (e.g.
                # "京鼎") is re-enforced on every sync and never reverts to the raw
                # OU value. Non-overridden departments keep their existing name,
                # so manual renames elsewhere are preserved.
                if is_overridden and node.name != display_name:
                    cls.update_by_id(node_id, {"name": display_name})
            else:
                # CommonService.insert returns peewee's save() result (row count),
                # not the instance, so generate the id ourselves and reuse it.
                node_id = get_uuid()
                try:
                    cls.insert(id=node_id, name=display_name, parent_id=parent_id, path_key=path_key, status=StatusEnum.VALID.value)
                except Exception:
                    # Lost an upsert race; fetch the row the other writer created.
                    node = cls.get_or_none(path_key=path_key)
                    if node is None:
                        logging.exception(f"Failed to upsert department for path_key={path_key}")
                        raise
                    node_id = node.id
            parent_id = node_id
            leaf_id = node_id
        return leaf_id

    @classmethod
    @DB.connection_context()
    def collect_subtree_ids(cls, department_id):
        """
        Return the set of department ids covering ``department_id`` and all of its
        descendants (the full subtree), or an empty set when the id is unknown.
        """
        if not department_id:
            return set()
        children_by_parent = {}
        for d in cls.get_all():
            children_by_parent.setdefault(d.parent_id, []).append(d.id)
        subtree = set()
        stack = [department_id]
        while stack:
            cur = stack.pop()
            if cur in subtree:
                continue
            subtree.add(cur)
            stack.extend(children_by_parent.get(cur, []))
        return subtree

    @classmethod
    @DB.connection_context()
    def list_subtree_members(cls, department_id):
        """
        List every user belonging to ``department_id`` or any of its descendant
        departments, with department-admins flagged. Returns a dict:
        ``{"department": {...}|None, "members": [...]}`` sorted admins-first then
        by display name. Read-only; used by the user-side "my department" view.
        """
        from api.db.services.user_service import UserService

        dept = cls.get_or_none(id=department_id) if department_id else None
        if dept is None:
            return {"department": None, "members": []}

        subtree_ids = cls.collect_subtree_ids(department_id)
        name_by_id = {d.id: d.name for d in cls.get_all() if d.id in subtree_ids}

        members = []
        for user in UserService.get_all_users():
            uid_dept = getattr(user, "department_id", None)
            if not uid_dept or uid_dept not in subtree_ids:
                continue
            last_login = getattr(user, "last_login_time", None)
            members.append(
                {
                    "email": user.email,
                    "nickname": user.nickname,
                    "avatar": user.avatar,
                    "is_dept_admin": bool(getattr(user, "is_dept_admin", False)),
                    "is_active": getattr(user, "is_active", True),
                    "department_id": uid_dept,
                    "department_name": name_by_id.get(uid_dept),
                    "last_login_time": last_login.isoformat() if last_login else None,
                }
            )

        members.sort(key=lambda m: (not m["is_dept_admin"], (m["nickname"] or m["email"] or "").lower()))
        return {
            "department": {"id": dept.id, "name": dept.name, "path_key": dept.path_key},
            "members": members,
        }
