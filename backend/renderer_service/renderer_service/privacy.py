"""Pure privacy filter shared by error, breadcrumb and transaction hooks."""

import re
from typing import Any
from urllib.parse import unquote_plus

_REDACTED = "[Filtered]"
_SECRET = re.compile(
    r"token|key|secret|password|auth|code|session|signature|sig|edit|email", re.I
)
_OMIT = re.compile(
    r"(^|\.)(authorization|proxy-authorization|cookie|set-cookie|cookies|body|"
    r"requestbody|postdata|user)$",
    re.I,
)
_QUERY = re.compile(r"(^|[?&#;\s])([^=?&#;\s]+)=([^&#;\s\"'<>]*)")


def _text(value: str) -> str:
    value = re.sub(r"(https?://)[^/@\s]+@", r"\1[Filtered]@", value, flags=re.I)
    value = re.sub(
        r"\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [Filtered]", value, flags=re.I
    )
    value = re.sub(
        r"\b(?:mfa\.[\w-]{20,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{25,110})\b",
        _REDACTED,
        value,
    )
    value = re.sub(
        r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", _REDACTED, value, flags=re.I
    )
    return _QUERY.sub(
        lambda match: (
            f"{match[1]}{match[2]}={_REDACTED}"
            if _SECRET.search(unquote_plus(match[2]))
            else match[0]
        ),
        value,
    )


def scrub_telemetry(value: Any, field: str = "", depth: int = 0) -> Any:
    """Return a scrubbed copy without modifying SDK or application objects."""
    if depth > 30:
        return _REDACTED
    if isinstance(value, str):
        return _text(value)
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            name = str(key)
            normalized = re.sub(r"[_-]", "", name)
            if field == "dynamic_sampling_context" and name == "public_key":
                result[name] = item
                continue
            if (
                _OMIT.search(name)
                or _OMIT.search(normalized)
                or (field == "request" and name.lower() in {"data", "query", "form"})
            ):
                continue
            result[_text(name)] = (
                _REDACTED
                if _SECRET.search(name)
                else scrub_telemetry(item, name, depth + 1)
            )
        return result
    if isinstance(value, (list, tuple)):
        if field in {"headers", "query_string"}:
            return [
                [item[0], _REDACTED]
                if isinstance(item, (list, tuple))
                and item
                and _SECRET.search(str(item[0]))
                else scrub_telemetry(item, depth=depth + 1)
                for item in value
                if not (
                    isinstance(item, (list, tuple))
                    and item
                    and _OMIT.search(str(item[0]))
                )
            ]
        return [scrub_telemetry(item, depth=depth + 1) for item in value]
    return value
