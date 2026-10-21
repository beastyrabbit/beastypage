import json
from unittest.mock import Mock

import pytest
import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from renderer_service.monitoring import init_monitoring
from renderer_service.privacy import scrub_telemetry


def test_scrubber_removes_request_secrets_and_preserves_input():
    discord_token = f"{'A' * 24}.abcdef.{'B' * 32}"
    event = {
        "request": {
            "url": "/?%74oken=private-token&edit=private-edit&ok=1",
            "headers": {
                "Authorization": "private-auth",
                "Cookie": "private-cookie",
                "SET-COOKIE": "private-set-cookie",
                "Accept": "application/json",
            },
            "cookies": {"session": "private-cookie"},
            "data": "private-body",
            "body": "private-body",
            "query_string": [["api_key", "private-key"], ["page", "2"]],
        },
        "user": {"email": "person@example.test"},
        "exception": {
            "values": [
                {"value": f"person@example.test Bearer private-bearer {discord_token}"}
            ]
        },
        "breadcrumbs": [{"data": {"headers": [["AUTHORIZATION", "private-auth"]]}}],
        "tags": {"service": "renderer"},
    }
    original = json.dumps(event)
    result = scrub_telemetry(event)
    encoded = json.dumps(result)
    assert json.dumps(event) == original
    assert result["request"]["headers"] == {"Accept": "application/json"}
    assert result["tags"] == {"service": "renderer"}
    assert result["request"]["query_string"] == [
        ["api_key", "[Filtered]"],
        ["page", "2"],
    ]
    assert "ok=1" in encoded
    for value in ["private-", "person@example.test", discord_token]:
        assert value not in encoded
    for key in ["cookies", "body", "data", "user"]:
        assert key not in result["request"]
    assert "user" not in result


@pytest.mark.parametrize(
    "key",
    [
        "token",
        "key",
        "secret",
        "password",
        "auth",
        "code",
        "session",
        "signature",
        "sig",
        "edit",
    ],
)
def test_scrubs_query_strings_and_maps(key):
    assert scrub_telemetry(f"/?{key}=private-value&ok=1") == f"/?{key}=[Filtered]&ok=1"
    assert scrub_telemetry({"query_string": {key: "private-value"}}) == {
        "query_string": {key: "[Filtered]"}
    }


@pytest.mark.parametrize("dsn", [None, ""])
def test_no_dsn_means_no_initialization(monkeypatch, dsn):
    init = Mock()
    monkeypatch.setattr(sentry_sdk, "init", init)
    environment = {"SENTRY_DSN": "https://public@example.test/1"}
    if dsn is not None:
        environment["GLITCHTIP_DSN"] = dsn
    assert init_monitoring(environment) is False
    init.assert_not_called()


def test_sdk_reports_exceptions_5xx_and_transactions_through_fake_transport(
    monkeypatch,
):
    envelopes = []

    class FakeTransport(Transport):
        def capture_envelope(self, envelope):
            envelopes.append(envelope)

    previous = sentry_sdk.get_global_scope().client
    real_init = sentry_sdk.init
    monkeypatch.setattr(
        sentry_sdk,
        "init",
        lambda **options: real_init(**options, transport=FakeTransport),
    )
    with sentry_sdk.isolation_scope():
        assert init_monitoring(
            {
                "GLITCHTIP_DSN": "https://public@example.test/1",
                "GLITCHTIP_ENVIRONMENT": "production",
                "APP_VERSION": "v10.0.0",
            }
        )
        client = sentry_sdk.get_client()
        try:
            assert client.options["send_default_pii"] is False
            assert client.options["traces_sample_rate"] == 0.05
            assert client.options["include_local_variables"] is False
            sentry_sdk.add_breadcrumb(
                message="person@example.test Bearer private-bearer"
            )
            app = FastAPI()

            @app.get("/error")
            def error():
                raise RuntimeError("person@example.test Bearer private-bearer")

            @app.get("/unavailable")
            def unavailable():
                raise HTTPException(503, "Service temporarily unavailable")

            with TestClient(app, raise_server_exceptions=False) as http:
                assert (
                    http.get(
                        "/error?edit=private-edit",
                        headers={
                            "Authorization": "private-auth",
                            "Cookie": "private-cookie",
                        },
                    ).status_code
                    == 500
                )
                assert http.get("/unavailable").status_code == 503

            url = (
                "https://cdn.discordapp.com/attachments/1/2/x.png"
                "?ex=a&is=b&hm=c#private-fragment"
            )
            filtered = "https://cdn.discordapp.com/[Filtered]"
            sentry_sdk.add_breadcrumb(
                category="http", message=f"GET {url}", data={"url": url}
            )
            with sentry_sdk.start_transaction(
                name="test /?token=private-token", sampled=True
            ):
                with sentry_sdk.start_span(
                    op="http.client", description=f"GET {url}"
                ) as span:
                    for key in ["url", "url.full", "http.url", "server.address"]:
                        span.set_data(key, url)
            sentry_sdk.capture_event(
                {"message": f"Download {url}", "request": {"url": url}}
            )
            sentry_sdk.flush(timeout=2)
            events = [
                item.payload.json
                for envelope in envelopes
                for item in envelope.items
                if item.type == "event"
            ]
            transactions = [
                item.payload.json
                for envelope in envelopes
                for item in envelope.items
                if item.type == "transaction"
            ]
            assert len(events) >= 2
            assert transactions
            outbound = next(
                event
                for event in transactions
                if event["transaction"].startswith("test ")
            )
            span = outbound["spans"][0]
            assert span["description"] == f"GET {filtered}"
            for key in ["url", "url.full", "http.url", "server.address"]:
                assert span["data"][key] == filtered
            download = next(
                event
                for event in events
                if event.get("message", "").startswith("Download ")
            )
            assert download["message"] == f"Download {filtered}"
            assert download["request"]["url"] == filtered
            breadcrumb = download["breadcrumbs"]["values"][-1]
            assert breadcrumb["data"]["url"] == filtered
            assert breadcrumb["message"] == f"GET {filtered}"
            for event in events + transactions:
                assert event["release"] == "beastypage@v10.0.0"
                assert event["environment"] == "production"
                assert event["tags"]["service"] == "renderer"
            encoded = json.dumps(
                [envelope.headers for envelope in envelopes] + events + transactions
            )
            assert "person@example.test" not in encoded
            assert "private-" not in encoded
            for forbidden in ["/attachments", "ex=a", "is=b", "hm=c"]:
                assert forbidden not in encoded
        finally:
            client.close(timeout=2)
            sentry_sdk.get_global_scope().set_client(previous)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("a+b%tag@sub.example.COM_ending", "[Filtered]_ending"),
        ("a@b.co@c.de", "[Filtered]@c.de"),
        ("a@b@c.de", "a@[Filtered]"),
        ("a@b.c a@.co", "a@b.c a@.co"),
        ("a@b..co", "[Filtered]"),
        ("a@b.co.more123", "[Filtered]123"),
        ("first@site.test, second@other.test", "[Filtered], [Filtered]"),
        ("BEARER aZ09._~+/=-", "Bearer [Filtered]"),
        ("İ@ſ.Kı", "[Filtered]"),
        ("a" * 50_000, "a" * 50_000),
        ("a@" + "b." * 25_000 + "c", "a@" + "b." * 25_000 + "c"),
    ],
)
def test_email_and_bearer_matching(message, expected):
    assert scrub_telemetry(message) == expected


def test_environment_and_release_defaults(monkeypatch):
    init = Mock()
    monkeypatch.setattr(sentry_sdk, "init", init)
    monkeypatch.setattr(sentry_sdk, "set_tag", Mock())
    assert init_monitoring({"GLITCHTIP_DSN": "https://public@example.test/1"})
    assert init.call_args.kwargs["environment"] == "development"
    assert init.call_args.kwargs["release"] == "beastypage@dev"
