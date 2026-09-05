from pathlib import Path

import pytest
import yaml


@pytest.mark.parametrize("provider", ["github", "forgejo"])
def test_publication_requires_successful_application_checks(provider):
    root = Path(__file__).resolve().parents[3]
    workflow = yaml.safe_load(
        (root / f".{provider}/workflows/build-images.yml").read_text()
    )
    jobs = workflow["jobs"]
    for publish, check in [
        ("deploy-convex", "cat-system-contract"),
        ("build-image-processing", "check-image-processing"),
        ("build-media", "check-media"),
    ]:
        assert check in jobs[publish]["needs"]
        condition = jobs[publish]["if"]
        assert condition.strip().startswith(
            f"always() && needs.{check}.result == 'success' &&"
        )
    assert "refs/heads/main" in jobs["deploy-convex"]["if"]
