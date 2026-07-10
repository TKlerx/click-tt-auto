from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, cast


REDACTED_VALUE = "[REDACTED]"
TRUNCATED_VALUE = "[Truncated]"
MAX_DEPTH = 5
MAX_STRING_LENGTH = 4096
SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "cookies",
    "password",
    "secret",
    "token",
    "tokenValue",
    "accessToken",
    "refreshToken",
    "idToken",
    "clientSecret",
    "set-cookie",
    "apiKey",
    "apiToken",
    "sessionToken",
    "email",
    "userEmail",
    "recipientEmail",
    "senderEmail",
    "displayName",
    "senderDisplayName",
    "recipientName",
    "userName",
}
SENSITIVE_KEYS_NORMALIZED = {
    "".join(char for char in key.lower() if char.isalnum()) for key in SENSITIVE_KEYS
}


def _normalize_key(key: str) -> str:
    return "".join(char for char in key.lower() if char.isalnum())


def _is_sensitive_key(key: str) -> bool:
    return (
        key in SENSITIVE_KEYS
        or key.lower() in SENSITIVE_KEYS
        or _normalize_key(key) in SENSITIVE_KEYS_NORMALIZED
    )


def _sanitize_string(value: str) -> str:
    if len(value) <= MAX_STRING_LENGTH:
        return value
    return f"{value[:MAX_STRING_LENGTH]}...[Truncated]"


def sanitize_log_value(value: Any, depth: int = 0) -> Any:
    if isinstance(value, BaseException):
        return {
            "name": type(value).__name__,
            "message": _sanitize_string(str(value)),
        }

    if value is None or isinstance(value, bool | int | float):
        return value

    if isinstance(value, str):
        return _sanitize_string(value)

    if depth >= MAX_DEPTH:
        return TRUNCATED_VALUE

    if isinstance(value, list | tuple):
        return [sanitize_log_value(item, depth + 1) for item in value]

    if isinstance(value, dict):
        return {
            str(key): (
                REDACTED_VALUE
                if _is_sensitive_key(str(key))
                else sanitize_log_value(item, depth + 1)
            )
            for key, item in value.items()
        }

    return _sanitize_string(str(value))


def sanitize_log_meta(meta: dict[str, Any]) -> dict[str, Any]:
    return cast(dict[str, Any], sanitize_log_value(meta))


class WorkerLogger:
    def __init__(self, name: str) -> None:
        self.logger = logging.getLogger(name)

    def _log(self, level: str, event: str, **meta: Any) -> None:
        method_name = "warning" if level == "warn" else level
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "event": event,
            "component": "worker",
            **sanitize_log_meta(meta),
        }
        try:
            getattr(self.logger, method_name)(
                json.dumps(payload, separators=(",", ":"), sort_keys=True)
            )
        except Exception:
            return

    def info(self, event: str, **meta: Any) -> None:
        self._log("info", event, **meta)

    def warning(self, event: str, **meta: Any) -> None:
        self._log("warn", event, **meta)

    def error(self, event: str, **meta: Any) -> None:
        self._log("error", event, **meta)

    def exception(self, event: str, error: BaseException, **meta: Any) -> None:
        self._log("error", event, error=error, **meta)


def create_worker_logger(name: str = "starter-worker") -> WorkerLogger:
    return WorkerLogger(name)
