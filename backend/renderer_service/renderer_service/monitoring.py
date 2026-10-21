"""Optional GlitchTip reporting through the official Sentry SDK."""

import os
from collections.abc import Mapping
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .privacy import scrub_telemetry


def _scrub(event: Any, _hint: Any) -> Any:
    return scrub_telemetry(event)


def init_monitoring(environment: Mapping[str, str] | None = None) -> bool:
    env = os.environ if environment is None else environment
    dsn = env.get("GLITCHTIP_DSN")
    if not dsn:
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=env.get("GLITCHTIP_ENVIRONMENT", "development"),
        release=f"beastypage@{env.get('APP_VERSION', 'dev')}",
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=0.05,
        trace_lifecycle="static",
        integrations=[
            StarletteIntegration(failed_request_status_codes=set(range(500, 600))),
            FastApiIntegration(failed_request_status_codes=set(range(500, 600))),
        ],
        before_send=_scrub,
        before_breadcrumb=_scrub,
        before_send_transaction=_scrub,
    )
    sentry_sdk.set_tag("service", "renderer")
    return True
