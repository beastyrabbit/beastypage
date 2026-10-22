"""Wait for a released frontend version to go live, then check that it is healthy.

Polls BASE_URL/api/version until it reports the expected tag on several
consecutive polls, so a half-finished rolling update does not count. A newer
version means the release was superseded, which is reported as a failure, not
success. Only the frontend reports its version; other services may roll later.

Usage: release_smoke.py --base-url URL --expected vX.Y.Z
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request

USER_AGENT = "beastypage-release-smoke"
VERSION_PATTERN = re.compile(r"v?(\d+)\.(\d+)\.(\d+)")


def fetch(url, timeout=20):
    """Return (status, body); status is None when the request did not complete."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as error:
        return None, str(error)


def parse_version(text):
    match = VERSION_PATTERN.fullmatch(text or "")
    return tuple(int(part) for part in match.groups()) if match else None


def live_version(base_url):
    status, body = fetch(f"{base_url}/api/version")
    if status != 200:
        return None, f"HTTP {status}: {body[:120]}"
    try:
        version = json.loads(body)["version"]
    except (ValueError, KeyError, TypeError):
        return None, f"unexpected body: {body[:120]}"
    return version, version


def wait_for_version(
    base_url,
    expected,
    timeout,
    poll,
    stable,
    sleep=time.sleep,
    clock=time.monotonic,
    out=print,
):
    """Return ("live" | "superseded" | "timeout", last seen version text)."""
    wanted = parse_version(expected)
    deadline = clock() + timeout
    streak = 0
    seen = "nothing yet"
    while True:
        version, seen = live_version(base_url)
        if version == expected:
            streak += 1
            if streak >= stable:
                return "live", seen
        else:
            streak = 0
            found = parse_version(version)
            if wanted and found and found > wanted:
                return "superseded", seen
        out(f"Live version: {seen} (want {expected}, {streak}/{stable} in a row)")
        if clock() >= deadline:
            return "timeout", seen
        sleep(poll)


def health_problems(base_url):
    problems = []
    status, _ = fetch(f"{base_url}/")
    if status != 200:
        problems.append(f"/ returned HTTP {status}")
    checks = [
        ("/api/health/database", lambda body: body.get("ok") is True),
        ("/api/renderer/health", lambda body: body.get("status") == "ok"),
    ]
    for path, healthy in checks:
        status, body = fetch(f"{base_url}{path}")
        try:
            ok = status == 200 and healthy(json.loads(body))
        except (ValueError, AttributeError):
            ok = False
        if not ok:
            problems.append(f"{path} returned HTTP {status}: {body[:200]}")
    return problems


def main(argv=None, sleep=time.sleep, clock=time.monotonic, out=print):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--expected", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=30 * 60)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--stable-polls", type=int, default=3)
    args = parser.parse_args(argv)
    base_url = args.base_url.rstrip("/")

    result, seen = wait_for_version(
        base_url,
        args.expected,
        args.timeout_seconds,
        args.poll_seconds,
        args.stable_polls,
        sleep=sleep,
        clock=clock,
        out=out,
    )
    if result == "superseded":
        out(
            f"::error::{args.expected} was superseded: {base_url} already serves "
            f"{seen}. This release was not verified."
        )
        return 1
    if result == "timeout":
        out(
            f"::error::{base_url} did not serve {args.expected} within "
            f"{args.timeout_seconds}s (last saw {seen}). Check the Flux image "
            "policy, HelmRelease/beastypage and the frontend pods."
        )
        return 1
    out(f"{base_url} serves {args.expected}")

    problems = health_problems(base_url)
    for problem in problems:
        out(f"::error::{args.expected} is live but unhealthy: {problem}")
    if not problems:
        out("Public page, database and renderer health checks passed")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
