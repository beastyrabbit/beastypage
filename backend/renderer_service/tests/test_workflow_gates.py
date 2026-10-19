from pathlib import Path

import yaml


def test_publication_requires_successful_application_checks():
    root = Path(__file__).resolve().parents[3]
    workflow = yaml.safe_load((root / ".github/workflows/build-images.yml").read_text())
    jobs = workflow["jobs"]
    for publish, check in [
        ("build-image-processing", "check-image-processing"),
        ("build-media", "check-media"),
    ]:
        assert check in jobs[publish]["needs"]
        condition = jobs[publish]["if"]
        assert condition.strip().startswith(
            f"always() && needs.{check}.result == 'success' &&"
        )
    assert {
        "build-frontend",
        "build-renderer",
        "build-image-processing",
        "build-media",
    } <= jobs.keys()
