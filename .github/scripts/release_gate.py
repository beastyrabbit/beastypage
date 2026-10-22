"""Prove that a release commit already passed validate.yml before publishing.

A pull request run tests the PR merge ref, so its proof is the tree it recorded
as a `validated-tree-<tree>` artifact. The tag passes when the newest
validate.yml run of an associated PR succeeded and recorded the tag's tree, or
when the newest manual validate.yml run on the tag commit itself succeeded.
Everything else fails closed; only an unfinished run is waited for.

Usage: release_gate.py --repo OWNER/REPO --sha COMMIT --tree TREE
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
WORKFLOW = "validate.yml"
REQUIRED_JOBS = ("applications", "database")
TREE_ARTIFACT_PREFIX = "validated-tree-"

PASS, PENDING, FAIL = "pass", "pending", "fail"


class GateError(Exception):
    """The GitHub API could not answer; the gate cannot decide."""


def github_api(token):
    def get(path):
        request = urllib.request.Request(
            API + path,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                **({"Authorization": f"Bearer {token}"} if token else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except (urllib.error.URLError, OSError, ValueError) as error:
            raise GateError(f"GET {path} failed: {error}") from error

    return get


def newest(runs):
    return max(runs, key=lambda run: run["run_number"], default=None)


def check_run(api, repo, run, tree=None):
    """Judge one validate.yml run; with a tree, also require it as the tested tree."""
    url = run["html_url"]
    if run["status"] != "completed":
        return PENDING, f"{url} is still {run['status']}"
    if run["conclusion"] != "success":
        return FAIL, f"{url} concluded {run['conclusion']}"
    jobs = api(f"/repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100")["jobs"]
    by_name = {job["name"]: job for job in jobs}
    for name in REQUIRED_JOBS:
        job = by_name.get(name)
        if job is None:
            return FAIL, f"{url} has no {name} job"
        if (job["status"], job["conclusion"]) != ("completed", "success"):
            return FAIL, f"{url} job {name} is {job['status']}/{job['conclusion']}"
    if tree is not None:
        artifacts = api(
            f"/repos/{repo}/actions/runs/{run['id']}/artifacts?per_page=100"
        )
        recorded = [
            artifact["name"].removeprefix(TREE_ARTIFACT_PREFIX)
            for artifact in artifacts["artifacts"]
            if artifact["name"].startswith(TREE_ARTIFACT_PREFIX)
        ]
        if recorded != [tree]:
            return FAIL, (
                f"{url} tested tree {', '.join(recorded) or '(not recorded)'}, "
                f"but the tag's tree is {tree}"
            )
    return PASS, url


def evaluate(api, repo, sha, tree):
    """Return (PASS|PENDING|FAIL, messages) for the release commit."""
    outcomes = []
    for pr in api(f"/repos/{repo}/commits/{sha}/pulls"):
        runs = api(
            f"/repos/{repo}/actions/workflows/{WORKFLOW}/runs"
            f"?event=pull_request&head_sha={pr['head']['sha']}&per_page=100"
        )["workflow_runs"]
        run = newest(runs)
        if run is None:
            outcomes.append((FAIL, f"PR #{pr['number']} has no {WORKFLOW} run"))
        else:
            state, message = check_run(api, repo, run, tree)
            outcomes.append((state, f"PR #{pr['number']}: {message}"))
    if not outcomes:
        outcomes.append((FAIL, f"no pull request is associated with {sha}"))

    runs = api(
        f"/repos/{repo}/actions/workflows/{WORKFLOW}/runs"
        f"?event=workflow_dispatch&head_sha={sha}&per_page=100"
    )["workflow_runs"]
    run = newest(runs)
    if run is None:
        outcomes.append((FAIL, f"no manual {WORKFLOW} run on {sha}"))
    else:
        state, message = check_run(api, repo, run)
        outcomes.append((state, f"manual run: {message}"))

    for state in (PASS, PENDING):
        matching = [message for found, message in outcomes if found == state]
        if matching:
            return state, matching
    return FAIL, [message for _, message in outcomes]


def run_gate(
    api,
    repo,
    sha,
    tree,
    wait_seconds,
    poll_seconds,
    sleep=time.sleep,
    clock=time.monotonic,
    out=print,
):
    deadline = clock() + wait_seconds
    while True:
        try:
            state, messages = evaluate(api, repo, sha, tree)
        except GateError as error:
            out(f"::error::Release gate could not check validation: {error}")
            return 1
        if state == PASS:
            out(f"Validation proven for {sha} (tree {tree}) by {messages[0]}")
            return 0
        if state == PENDING and clock() < deadline:
            for message in messages:
                out(f"Waiting: {message}")
            sleep(poll_seconds)
            continue
        if state == PENDING:
            messages = [f"timed out waiting: {message}" for message in messages]
        out(f"::error::{sha} has no passing {WORKFLOW} proof; nothing was published.")
        for message in messages:
            out(f"::error::{message}")
        out(
            f"::error::Recover: run `gh workflow run {WORKFLOW} --ref <tag>` on this "
            "commit, wait for it to pass, then re-run the failed jobs of this run."
        )
        return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--tree", required=True)
    parser.add_argument("--wait-seconds", type=int, default=45 * 60)
    parser.add_argument("--poll-seconds", type=int, default=30)
    args = parser.parse_args(argv)
    api = github_api(os.environ.get("GITHUB_TOKEN"))
    return run_gate(
        api, args.repo, args.sha, args.tree, args.wait_seconds, args.poll_seconds
    )


if __name__ == "__main__":
    sys.exit(main())
