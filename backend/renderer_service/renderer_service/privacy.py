"""Pure privacy filter shared by error, breadcrumb and transaction hooks."""

import re
from typing import Any
from urllib.parse import unquote_plus, urlsplit

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


def _scrub_emails(value: str) -> str:
    chunks = []
    copied_through = 0
    # Split at @ so neither failed local parts nor domains are retried at
    # every character. Keep re.I's Unicode case-folding behavior.
    parts = value.split("@")
    at = -1
    for local, domain in zip(parts, parts[1:]):
        at += len(local) + 1
        start = at
        while start > copied_through and re.fullmatch(
            r"[A-Z0-9._%+-]", value[start - 1], re.I
        ):
            start -= 1
        if start == at:
            continue
        match = re.match(r"^[A-Z0-9.-]+\.[A-Z]{2,}", domain, re.I)
        if match is None:
            continue
        chunks.extend((value[copied_through:start], _REDACTED))
        copied_through = at + 1 + len(match[0])
    return "".join(chunks) + value[copied_through:]


def _scrub_absolute_url(match: re.Match) -> str:
    try:
        url = urlsplit(match[0])
        host = url.hostname
        if not host:
            return _REDACTED
        if ":" in host:
            host = f"[{host}]"
        if url.port is not None:
            host = f"{host}:{url.port}"
        return f"{url.scheme}://{host}/{_REDACTED}"
    except ValueError:
        return _REDACTED


def _text(value: str) -> str:
    # Paths and arbitrary query values can carry replayable capabilities.
    value = re.sub(r"https?://[^\s<>\"']+", _scrub_absolute_url, value, flags=re.I)
    value = re.sub(r"(https?://)[^/@\s]+@", r"\1[Filtered]@", value, flags=re.I)
    value = re.sub(
        r"\bBearer\s+[A-Z0-9._~+/=-]+", "Bearer [Filtered]", value, flags=re.I
    )
    value = re.sub(
        r"\b(?:mfa\.[\w-]{20,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{25,110})\b",
        _REDACTED,
        value,
    )
    value = _scrub_emails(value)
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
        return _scrub_mapping(value, field, depth)
    if isinstance(value, (list, tuple)):
        if field in {"headers", "query_string"}:
            return _scrub_pairs(value, depth)
        return [scrub_telemetry(item, depth=depth + 1) for item in value]
    return value


def _scrub_mapping(value: dict, field: str, depth: int) -> dict:
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


def _scrub_pairs(value: list | tuple, depth: int) -> list:
    result = []
    for item in value:
        if isinstance(item, (list, tuple)) and item:
            name = str(item[0])
            if _OMIT.search(name):
                continue
            if _SECRET.search(name):
                result.append([item[0], _REDACTED])
                continue
        result.append(scrub_telemetry(item, depth=depth + 1))
    return result
