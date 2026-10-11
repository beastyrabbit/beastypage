import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from renderer_service.app import create_app
from renderer_service.models import BatchRenderRequest, BatchVariant, RenderOptions
from renderer_service.renderer.pipeline import RenderPipeline


@pytest.mark.parametrize(
    "options,variants",
    [
        ({"tileSize": 1025}, []),
        ({}, [{"id": str(i)} for i in range(257)]),
        ({"tileSize": 1024}, [{"id": str(i)} for i in range(16)]),
        ({"expandVariants": True}, []),
    ],
)
def test_batch_budget_rejects_before_rendering(options, variants):
    with pytest.raises(ValidationError):
        BatchRenderRequest.model_validate(
            {"payload": {"params": {}}, "options": options, "variants": variants}
        )


def test_small_batch_and_png_options():
    BatchRenderRequest.model_validate(
        {"payload": {"params": {}}, "variants": [{"id": "small"}]}
    )
    with pytest.raises(ValidationError):
        RenderOptions(outputFormat="array")


@pytest.mark.parametrize(
    "params",
    [
        {"blob": "x" * 50_000},
        {"tree": [[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[0]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]},
    ],
)
def test_render_json_input_budget_rejects_large_or_deep_values(params):
    with pytest.raises(ValidationError):
        BatchRenderRequest.model_validate(
            {"payload": {"params": params}, "variants": []}
        )


def test_batch_json_budget_rejects_cumulative_variant_payloads():
    variants = [
        {"id": str(index), "params": {"blob": "x" * 10_000}}
        for index in range(20)
    ]
    with pytest.raises(ValidationError, match="Batch input JSON"):
        BatchRenderRequest.model_validate(
            {"payload": {"params": {}}, "variants": variants}
        )


def test_render_json_input_budget_rejects_too_many_nodes():
    with pytest.raises(ValidationError, match="too many JSON values"):
        BatchRenderRequest.model_validate(
            {"payload": {"params": {"items": [None] * 20_000}}}
        )


def test_invalid_layer_does_not_open_renderer_circuit():
    app = create_app()
    payload = {
        "payload": {"params": {}},
        "options": {"frameMode": "layer", "layerId": "does-not-exist"},
    }
    with TestClient(app) as client:
        responses = [client.post("/render/batch", json=payload) for _ in range(10)]
        health = client.get("/health").json()

    assert all(response.status_code == 422 for response in responses)
    assert health["metrics"]["total_failed"] == 0
    assert health["metrics"]["circuit_open"] is False


def test_invalid_document_is_a_client_error_without_failure_counter():
    app = create_app()
    payload = {
        "payload": {
            "document": {
                "schemaVersion": 1,
                "traits": {"colour": 123},
            }
        }
    }
    with TestClient(app) as client:
        response = client.post("/render", json=payload)
        health = client.get("/health").json()

    assert response.status_code == 422
    assert health["metrics"]["total_failed"] == 0
    assert health["metrics"]["circuit_open"] is False


def test_request_body_limit_rejects_large_payload_before_json_validation():
    app = create_app()
    body = '{"payload":{"params":{"ignored":"' + ("x" * 2_100_000) + '"}}}'
    with TestClient(app) as client:
        response = client.post(
            "/render",
            content=body,
            headers={"content-type": "application/json"},
        )

    assert response.status_code == 413


@pytest.fixture(scope="module")
def pipeline():
    return RenderPipeline()


@pytest.mark.parametrize(
    "base,overrides",
    [
        (
            {"accessories": ["RED FEATHERS"], "accessory": "RED FEATHERS"},
            {"accessories": []},
        ),
        ({"scars": ["ONE"], "scar": "ONE"}, {"scars": []}),
        ({"darkForest": True, "darkMode": True}, {"darkForest": False}),
    ],
)
def test_batch_explicit_overrides_match_standalone(pipeline, base, overrides):
    params = {"spriteNumber": 5, "colour": "GINGER", **base}
    actual = pipeline._prepare_variant_params(
        params, BatchVariant(id="variant", overrides=overrides)
    )
    intended = {"spriteNumber": 5, "colour": "GINGER", **overrides}
    assert pipeline._coerce_document(actual) == pipeline._coerce_document(intended)


def test_numeric_pose_override_wins_over_inherited_pose(pipeline):
    base = pipeline._normalize_params({"spriteNumber": 5, "colour": "GINGER"})
    actual = pipeline._prepare_variant_params(
        base, BatchVariant(id="pose", spriteNumber=8)
    )
    assert actual["spriteNumber"] == 8


def test_sheet_copies_translucent_pixels(pipeline, monkeypatch):
    tile = Image.new("RGBA", (50, 50), (200, 100, 50, 128))
    monkeypatch.setattr(pipeline.executor, "execute", lambda *_: (tile.copy(), []))
    result = pipeline.render_batch(
        {"spriteNumber": 5, "colour": "GINGER"},
        [BatchVariant(id="next")],
        include_sources=True,
    )
    for frame, (_, source) in zip(result.frames, result.sources):
        assert (
            result.sheet.crop((frame.x, frame.y, frame.x + 50, frame.y + 50)).tobytes()
            == source.tobytes()
        )
