import pytest
from PIL import Image
from pydantic import ValidationError

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
