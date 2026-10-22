import importlib.util
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
BUILD_JOBS = {
    "build-frontend",
    "build-renderer",
    "build-image-processing",
    "build-discord-bot",
    "build-media",
}


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / ".github/scripts" / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_workflow(name):
    workflow = yaml.safe_load((ROOT / ".github/workflows" / name).read_text())
    # PyYAML reads the bare `on:` key as boolean True.
    return workflow[True], workflow["jobs"]


gate_script = load_script("release_gate")


def test_publication_requires_the_release_gate():
    triggers, jobs = load_workflow("build-images.yml")
    assert triggers["push"] == {"tags": ["v*"]}
    assert "publish_images" in triggers["workflow_dispatch"]["inputs"]
    assert set(jobs) == {"release-gate", *BUILD_JOBS, "deploy-smoke"}
    for name in BUILD_JOBS:
        assert jobs[name]["needs"] == "release-gate"
        condition = jobs[name]["if"]
        assert condition.strip().startswith("needs.release-gate.result == 'success' &&")
        assert "always()" not in condition

    gate = jobs["release-gate"]
    assert "inputs.publish_images" in gate["env"]["PUBLISHING"]
    gate_step = next(s for s in gate["steps"] if "release_gate.py" in s.get("run", ""))
    assert gate_step["if"] == "env.PUBLISHING == 'true'"

    smoke = jobs["deploy-smoke"]
    assert set(smoke["needs"]) == BUILD_JOBS
    assert smoke["if"] == "github.event_name == 'push'"


def test_validation_records_the_tested_tree_and_can_run_manually():
    triggers, jobs = load_workflow("validate.yml")
    assert {"pull_request", "workflow_dispatch"} <= set(triggers)
    uploads = [
        step
        for step in jobs["applications"]["steps"]
        if step.get("uses", "").startswith("actions/upload-artifact@")
    ]
    assert len(uploads) == 1
    assert uploads[0]["with"]["name"] == (
        gate_script.TREE_ARTIFACT_PREFIX + "${{ steps.tree.outputs.tree }}"
    )
    assert uploads[0]["with"]["if-no-files-found"] == "error"
    assert uploads[0]["with"]["overwrite"] is True
    assert set(gate_script.REQUIRED_JOBS) <= set(jobs)


REPO = "beastyrabbit/beastypage"
SHA = "c" * 40
TREE = "a" * 40
PR_HEAD = "b" * 40


def workflow_run(run_id, status="completed", conclusion="success"):
    return {
        "id": run_id,
        "run_number": run_id,
        "status": status,
        "conclusion": conclusion,
        "html_url": f"https://github.com/{REPO}/actions/runs/{run_id}",
    }


class FakeGitHub:
    """Answers the release gate's GitHub API requests from in-memory fixtures."""

    def __init__(self, pr_runs=(), manual_runs=(), pulls=None):
        self.pulls = (
            [{"number": 176, "head": {"sha": PR_HEAD}}] if pulls is None else pulls
        )
        self.pr_runs = list(pr_runs)
        self.manual_runs = list(manual_runs)
        self.jobs = {}
        self.trees = {}
        self.broken = None

    def __call__(self, path):
        if self.broken and self.broken in path:
            raise gate_script.GateError(f"GET {path} failed: HTTP Error 502")
        runs = f"/repos/{REPO}/actions/workflows/validate.yml/runs"
        if path == f"/repos/{REPO}/commits/{SHA}/pulls":
            return self.pulls
        if path.startswith(f"{runs}?event=pull_request&head_sha={PR_HEAD}&"):
            return {"workflow_runs": self.pr_runs}
        if path.startswith(f"{runs}?event=workflow_dispatch&head_sha={SHA}&"):
            return {"workflow_runs": self.manual_runs}
        match = re.fullmatch(
            rf"/repos/{REPO}/actions/runs/(\d+)/(\w+)\?per_page=100", path
        )
        assert match, f"unexpected request {path}"
        run_id, kind = int(match[1]), match[2]
        if kind == "jobs":
            jobs = self.jobs.get(
                run_id,
                [
                    ("applications", "completed", "success"),
                    ("database", "completed", "success"),
                ],
            )
            return {
                "jobs": [
                    {"name": name, "status": status, "conclusion": conclusion}
                    for name, status, conclusion in jobs
                ]
            }
        tree = self.trees.get(run_id, TREE)
        names = [] if tree is None else [gate_script.TREE_ARTIFACT_PREFIX + tree]
        return {"artifacts": [{"name": name} for name in names]}


def gate(api, on_sleep=lambda: None, wait_seconds=600):
    now = [0.0]
    lines = []

    def sleep(seconds):
        now[0] += seconds
        on_sleep()

    code = gate_script.run_gate(
        api,
        REPO,
        SHA,
        TREE,
        wait_seconds,
        30,
        sleep=sleep,
        clock=lambda: now[0],
        out=lines.append,
    )
    return code, "\n".join(lines)


def test_gate_accepts_a_pr_run_that_tested_the_tagged_tree():
    code, output = gate(FakeGitHub(pr_runs=[workflow_run(199)]))
    assert code == 0
    assert f"https://github.com/{REPO}/actions/runs/199" in output


def test_gate_rejects_a_pr_run_that_tested_another_tree():
    api = FakeGitHub(pr_runs=[workflow_run(199)])
    api.trees[199] = "d" * 40
    code, output = gate(api)
    assert code == 1
    assert f"tested tree {'d' * 40}" in output
    assert "gh workflow run validate.yml" in output


def test_gate_rejects_a_pr_run_without_a_recorded_tree():
    api = FakeGitHub(pr_runs=[workflow_run(199)])
    api.trees[199] = None
    code, output = gate(api)
    assert code == 1
    assert "(not recorded)" in output


@pytest.mark.parametrize("conclusion", ["failure", "cancelled"])
def test_gate_rejects_an_unsuccessful_pr_run(conclusion):
    code, output = gate(FakeGitHub(pr_runs=[workflow_run(199, conclusion=conclusion)]))
    assert code == 1
    assert f"concluded {conclusion}" in output


def test_gate_requires_both_validation_jobs():
    api = FakeGitHub(pr_runs=[workflow_run(199)])
    api.jobs[199] = [("applications", "completed", "success")]
    code, output = gate(api)
    assert code == 1
    assert "has no database job" in output


def test_gate_rejects_a_newer_failure_after_an_older_success():
    api = FakeGitHub(
        pr_runs=[workflow_run(198), workflow_run(199, conclusion="failure")]
    )
    code, output = gate(api)
    assert code == 1
    assert "runs/199 concluded failure" in output


@pytest.mark.parametrize(
    "api",
    [FakeGitHub(pulls=[]), FakeGitHub(pr_runs=[])],
    ids=["no-pull-request", "no-validate-run"],
)
def test_gate_rejects_missing_validation(api):
    code, output = gate(api)
    assert code == 1
    assert f"no manual validate.yml run on {SHA}" in output


def test_gate_waits_for_an_in_progress_run_to_succeed():
    api = FakeGitHub(pr_runs=[workflow_run(199, status="in_progress", conclusion=None)])

    def finish():
        api.pr_runs = [workflow_run(199)]

    code, output = gate(api, on_sleep=finish)
    assert code == 0
    assert "Waiting: PR #176: https://github.com/" in output


def test_gate_stops_waiting_at_its_deadline():
    api = FakeGitHub(pr_runs=[workflow_run(199, status="queued", conclusion=None)])
    code, output = gate(api, wait_seconds=90)
    assert code == 1
    assert "timed out waiting" in output


@pytest.mark.parametrize("broken", ["/pulls", "/jobs", "event=workflow_dispatch"])
def test_gate_fails_closed_on_api_errors(broken):
    api = FakeGitHub(pr_runs=[workflow_run(199)])
    api.broken = broken
    code, output = gate(api)
    assert code == 1
    assert "could not check validation" in output
    assert "gh workflow run validate.yml --ref <tag>" in output


def test_gate_accepts_a_manual_run_on_the_tagged_commit():
    api = FakeGitHub(pulls=[], manual_runs=[workflow_run(250)])
    code, output = gate(api)
    assert code == 0
    assert "runs/250" in output


def test_gate_rejects_a_newer_failed_manual_run():
    api = FakeGitHub(
        pulls=[],
        manual_runs=[workflow_run(250), workflow_run(251, conclusion="failure")],
    )
    code, _ = gate(api)
    assert code == 1
