import importlib.util
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "release_smoke", ROOT / ".github/scripts/release_smoke.py"
)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

HEALTHY = {
    "/": (200, "<html>beastypage</html>"),
    "/api/health/database": (200, json.dumps({"ok": True})),
    "/api/renderer/health": (200, json.dumps({"status": "ok"})),
}


class Site:
    """Local stand-in for the live site. Each version request takes the next
    entry of `versions`; the last entry repeats."""

    def __init__(self):
        self.versions = []
        self.routes = dict(HEALTHY)

    def respond(self, path):
        if path == "/api/version":
            entry = self.versions.pop(0) if len(self.versions) > 1 else self.versions[0]
            return (
                entry
                if isinstance(entry, tuple)
                else (200, json.dumps({"version": entry}))
            )
        return self.routes.get(path, (404, "not found"))


@pytest.fixture
def site():
    state = Site()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            status, body = state.respond(self.path)
            payload = body.encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    state.url = f"http://127.0.0.1:{server.server_port}"
    yield state
    server.shutdown()
    server.server_close()


def run_smoke(site, expected="v11.2.0", timeout=600):
    now = [0.0]
    lines = []

    def sleep(seconds):
        now[0] += seconds

    code = smoke.main(
        [
            "--base-url",
            site.url,
            "--expected",
            expected,
            "--timeout-seconds",
            str(timeout),
            "--poll-seconds",
            "15",
        ],
        sleep=sleep,
        clock=lambda: now[0],
        out=lines.append,
    )
    return code, "\n".join(lines)


def test_smoke_waits_for_a_stable_rollout_then_checks_health(site):
    # A site without the endpoint yet, then a rolling update that still
    # answers from an old pod once.
    site.versions = [
        (404, "not found"),
        "v11.1.2",
        "v11.2.0",
        "v11.1.2",
        "v11.2.0",
        "v11.2.0",
        "v11.2.0",
    ]
    code, output = run_smoke(site)
    assert code == 0, output
    assert "serves v11.2.0" in output
    assert "health checks passed" in output
    assert site.versions == ["v11.2.0"]


def test_smoke_reports_a_newer_version_as_superseded(site):
    site.versions = ["v11.3.0"]
    code, output = run_smoke(site)
    assert code == 1
    assert "v11.2.0 was superseded" in output
    assert "v11.3.0" in output


@pytest.mark.parametrize("version", [None, 123, [11, 2, 0], {"tag": "v11.2.0"}])
def test_smoke_retries_malformed_versions_until_the_release_arrives(site, version):
    site.versions = [version, "v11.2.0"]
    code, output = run_smoke(site)
    assert code == 0, output
    assert "unexpected body:" in output
    assert "health checks passed" in output


def test_smoke_fails_when_the_release_never_arrives(site):
    site.versions = ["v11.1.2"]
    code, output = run_smoke(site, timeout=60)
    assert code == 1
    assert "did not serve v11.2.0 within 60s (last saw v11.1.2)" in output


@pytest.mark.parametrize(
    ("path", "response"),
    [
        ("/", (502, "bad gateway")),
        ("/api/health/database", (503, json.dumps({"ok": False}))),
        ("/api/renderer/health", (200, json.dumps({"status": "degraded"}))),
        ("/api/renderer/health", (200, "not json")),
    ],
)
def test_smoke_fails_loudly_when_the_live_release_is_unhealthy(site, path, response):
    site.versions = ["v11.2.0"]
    site.routes[path] = response
    code, output = run_smoke(site)
    assert code == 1
    assert f"::error::v11.2.0 is live but unhealthy: {path} returned" in output
