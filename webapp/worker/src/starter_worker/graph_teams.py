from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"

_TOKEN_CACHE: dict[str, Any] = {
    "access_token": None,
    "expires_at": 0.0,
}


def send_teams_channel_message(payload: dict[str, Any]) -> dict[str, Any]:
    team_id = str(payload.get("teamId") or "").strip()
    channel_id = str(payload.get("channelId") or "").strip()
    content = str(payload.get("content") or "").strip()
    content_type = str(payload.get("contentType") or "html").strip().lower()

    if not team_id:
        raise ValueError("teams_message_delivery payload is missing teamId.")
    if not channel_id:
        raise ValueError("teams_message_delivery payload is missing channelId.")
    if not content:
        raise ValueError("teams_message_delivery payload is missing content.")

    body = {
        "body": {
            "contentType": "text" if content_type == "text" else "html",
            "content": content,
        }
    }

    delegated_access_token = str(payload.get("delegatedAccessToken") or "").strip() or None
    result = _graph_request(
        delegated_access_token or _get_graph_access_token(),
        f"/teams/{urllib.parse.quote(team_id)}/channels/{urllib.parse.quote(channel_id)}/messages",
        method="POST",
        payload=body,
        error_prefix="Graph Teams send failed",
    )
    return result if isinstance(result, dict) else {}


def list_teams_channel_messages(payload: dict[str, Any]) -> dict[str, Any]:
    team_id = str(payload.get("teamId") or "").strip()
    channel_id = str(payload.get("channelId") or "").strip()
    delta_token = str(payload.get("deltaToken") or "").strip()
    top = int(payload.get("top") or 25)
    top = max(1, min(top, 50))

    if not team_id:
        raise ValueError("teams_intake_poll payload is missing teamId.")
    if not channel_id:
        raise ValueError("teams_intake_poll payload is missing channelId.")

    if delta_token:
        path = _normalize_delta_path(delta_token)
    else:
        path = (
            f"/teams/{urllib.parse.quote(team_id)}/channels/{urllib.parse.quote(channel_id)}/messages/delta"
            f"?$top={top}"
        )

    response = _graph_request(
        _get_graph_access_token(),
        path,
        error_prefix="Graph Teams list failed",
    )

    return response if isinstance(response, dict) else {}


def _normalize_delta_path(token: str) -> str:
    if token.startswith("https://graph.microsoft.com/v1.0"):
        return token.replace("https://graph.microsoft.com/v1.0", "", 1)
    if token.startswith("/"):
        return token
    return f"/{token}"


def _get_graph_access_token() -> str:
    client_id = _required_env("AZURE_AD_CLIENT_ID")
    client_secret = _required_env("AZURE_AD_CLIENT_SECRET")
    tenant_id = _required_env("AZURE_AD_TENANT_ID")
    return _get_access_token(client_id, client_secret, tenant_id)


def _required_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value or value == "replace-me":
        raise ValueError(f"{name} is required for Teams Graph jobs.")
    return value


def _get_access_token(client_id: str, client_secret: str, tenant_id: str) -> str:
    cached = _TOKEN_CACHE.get("access_token")
    expires_at = float(_TOKEN_CACHE.get("expires_at") or 0)
    if cached and expires_at > time.time() + 60:
        return str(cached)

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_request = urllib.request.Request(
        token_url,
        data=urllib.parse.urlencode(
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
                "scope": GRAPH_SCOPE,
            }
        ).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )

    try:
        # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
        with urllib.request.urlopen(token_request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Graph token request failed: HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Graph token request failed: {error.reason}") from error

    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Graph token response did not include an access token.")

    expires_in = int(payload.get("expires_in") or 3600)
    _TOKEN_CACHE["access_token"] = access_token
    _TOKEN_CACHE["expires_at"] = time.time() + expires_in
    return access_token


def _graph_request(
    access_token: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    error_prefix: str,
) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{GRAPH_BASE_URL}{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if payload is not None else {}),
        },
    )

    try:
        # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{error_prefix}: HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"{error_prefix}: {error.reason}") from error
