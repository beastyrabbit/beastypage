import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import ImageChops, ImageOps
from renderer_service.app import create_app
from renderer_service.models import LayerIdentifier
from renderer_service.renderer.document_schema import InvalidCatDocument
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.repository import SpriteRepository

FIXTURES_DIR = Path(__file__).parent / "fixtures"
CLAN_PALETTE_DIR = Path(__file__).parents[1] / "renderer_service" / "data" / "palettes"


def load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open("r", encoding="utf-8") as fh:
        return json.load(fh)


def render_layer_ids(
    pipeline: RenderPipeline, params: dict
) -> tuple[list[LayerIdentifier], list[list[str]]]:
    result = pipeline.render(params, collect_layers=True)
    layer_ids = [layer.id for layer in result.layers]
    diagnostics = [layer.diagnostics for layer in result.layers]
    return layer_ids, diagnostics


def test_pipeline_smoke():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    # Base coat only
    base_params = {
        "spriteNumber": 5,
        "peltName": "SingleColour",
        "colour": "GINGER",
    }
    ids, _ = render_layer_ids(pipeline, base_params)
    assert ids[0] == LayerIdentifier.base

    # White patches, points, vitiligo
    overlay_params = {
        **base_params,
        "whitePatches": "FRECKLES",
        "whitePatchesTint": "cream",
        "points": "SEALPOINT",
        "vitiligo": "VITILIGO",
    }
    ids, _ = render_layer_ids(pipeline, overlay_params)
    assert LayerIdentifier.white_patches in ids
    assert LayerIdentifier.points in ids
    assert LayerIdentifier.vitiligo in ids

    # Eyes (including heterochromia)
    eye_params = {
        **base_params,
        "eyeColour": "GREEN",
        "eyeColour2": "BLUE",
    }
    ids, diag = render_layer_ids(pipeline, eye_params)
    assert LayerIdentifier.eyes in ids
    eye_index = ids.index(LayerIdentifier.eyes)
    assert any("eye:" in entry for entry in diag[eye_index])

    # Shading, lighting, dark forest tint
    lighting_params = {
        **base_params,
        "shading": True,
        "darkForest": True,
        "lighting": True,
    }
    ids, _ = render_layer_ids(pipeline, lighting_params)
    assert LayerIdentifier.tint in ids  # shading / dark forest reuse tint layer id
    assert LayerIdentifier.lighting in ids

    # Skin, scars, accessories
    extras_params = {
        **base_params,
        "skinColour": "PINK",
        "scars": ["ONE"],
        "accessories": ["BLUE"],
    }
    ids, _ = render_layer_ids(pipeline, extras_params)
    assert LayerIdentifier.skin in ids
    assert LayerIdentifier.scars_primary in ids
    assert LayerIdentifier.accessories in ids


def test_named_pose_render_smoke():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    for pose_name in ("newborn2", "adolescent_long2", "kitten0"):
        result = pipeline.render(
            {
                "poseName": pose_name,
                "spriteNumber": 8,
                "peltName": "SingleColour",
                "colour": "WHITE",
                "eyeColour": "BLUE",
                "skinColour": "PINK",
            },
            collect_layers=True,
        )
        assert result.composed.getbbox() is not None
        assert LayerIdentifier.base in [layer.id for layer in result.layers]


def test_legacy_sprite_number_maps_to_original_pose():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    legacy = pipeline.render(
        {"spriteNumber": 9, "peltName": "SingleColour", "colour": "WHITE"},
        collect_layers=False,
    ).composed
    named = pipeline.render(
        {
            "spriteNumber": 9,
            "poseName": "adult_long0",
            "peltName": "SingleColour",
            "colour": "WHITE",
        },
        collect_layers=False,
    ).composed

    assert legacy.tobytes() == named.tobytes()


def test_heterochromia_uses_masked_eye_sheet():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    result = pipeline.render(
        {
            "poseName": "adult_short2",
            "peltName": "SingleColour",
            "colour": "WHITE",
            "eyeColour": "GREEN",
            "eyeColour2": "BLUE",
        },
        collect_layers=True,
    )

    eyes_layer = next(
        layer for layer in result.layers if layer.id == LayerIdentifier.eyes
    )
    assert "eye:GREEN" in eyes_layer.diagnostics
    assert "eye2:BLUE" in eyes_layer.diagnostics


def test_none_tints_are_noops_and_null_tints_are_rejected():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    base_params = {
        "poseName": "adult_short2",
        "peltName": "SingleColour",
        "colour": "WHITE",
        "whitePatches": "ANY",
    }

    none_render = pipeline.render(
        {**base_params, "tint": "none", "whitePatchesTint": "none"},
        collect_layers=False,
    ).composed
    default_render = pipeline.render(base_params, collect_layers=False).composed

    assert none_render.tobytes() == default_render.tobytes()
    with pytest.raises(InvalidCatDocument, match="tint"):
        pipeline.render(
            {**base_params, "tint": "null", "whitePatchesTint": "null"},
            collect_layers=False,
        )


def test_reference_cat_complex_layers():
    """Full render of reference cat with combined features."""
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    fixture = load_fixture("reference_cat.json")
    params = {**fixture["params"]}

    result = pipeline.render(params, collect_layers=True)

    layer_ids = [layer.id for layer in result.layers]
    assert LayerIdentifier.base in layer_ids
    assert LayerIdentifier.vitiligo in layer_ids
    assert LayerIdentifier.accessories in layer_ids
    assert LayerIdentifier.scars_primary in layer_ids
    assert LayerIdentifier.tint in layer_ids

    # make sure we drew something visible
    assert result.composed.getbbox() is not None

    accessories_layer = next(
        layer for layer in result.layers if layer.id == LayerIdentifier.accessories
    )
    assert any("MAPLE" in note.upper() for note in accessories_layer.diagnostics)

    scars_layer = next(
        layer for layer in result.layers if layer.id == LayerIdentifier.scars_primary
    )
    assert any("FROSTSOCK" in note.upper() for note in scars_layer.diagnostics)

    tint_layer = next(
        layer for layer in result.layers if layer.id == LayerIdentifier.tint
    )
    assert any(note.startswith("tint") for note in tint_layer.diagnostics)


def test_clan_palette_colours_render():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    for palette_path in sorted(CLAN_PALETTE_DIR.glob("*clan.json")):
        palette = json.loads(palette_path.read_text(encoding="utf-8"))
        colour_name = next(
            name
            for name, definition in palette["colors"].items()
            if "multiply" in definition
        )
        result = pipeline.render(
            {
                "spriteNumber": 5,
                "peltName": "SingleColour",
                "colour": colour_name,
            },
            collect_layers=False,
        )
        assert result.composed.getbbox() is not None, palette_path.name


def test_missing_scar_masks_do_not_blank_sprite():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    base_params = {
        "spriteNumber": 0,
        "peltName": "Tabby",
        "colour": "GREY",
    }

    base_result = pipeline.render(base_params, collect_layers=False)

    scar_params = {
        **base_params,
        "scars": ["NOPAW"],
    }
    scar_result = pipeline.render(scar_params, collect_layers=True)

    scar_layers = [layer.id for layer in scar_result.layers]
    assert LayerIdentifier.scars_secondary in scar_layers

    base_alpha_sum = base_result.composed.split()[3].getdata()
    scar_alpha_sum = scar_result.composed.split()[3].getdata()

    base_total = sum(base_alpha_sum)
    scar_total = sum(scar_alpha_sum)

    assert scar_total < base_total
    assert scar_total > 0


def test_named_pose_missing_scar_changes_render():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    base_params = {
        "poseName": "adolescent_long0",
        "spriteNumber": 8,
        "peltName": "SingleColour",
        "colour": "BLACK",
        "eyeColour": "BLUE",
        "skinColour": "PINK",
    }

    base = pipeline.render(base_params, collect_layers=False).composed.convert("RGB")
    scar_result = pipeline.render(
        {**base_params, "scars": ["NOTAIL"]}, collect_layers=True
    )
    scarred = scar_result.composed.convert("RGB")

    diff = ImageChops.difference(base, scarred)
    assert diff.getbbox() is not None

    secondary_layer = next(
        layer
        for layer in scar_result.layers
        if layer.id == LayerIdentifier.scars_secondary
    )
    assert secondary_layer.image.getbbox() is not None
    assert "missingscarsNOTAIL" in secondary_layer.diagnostics


def test_primary_scar_changes_render():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    base_params = {
        "poseName": "adult_short2",
        "spriteNumber": 8,
        "peltName": "SingleColour",
        "colour": "BLACK",
        "eyeColour": "BLUE",
        "skinColour": "PINK",
    }

    base = pipeline.render(base_params, collect_layers=False).composed.convert("RGB")
    scar_result = pipeline.render(
        {**base_params, "scars": ["ONE"]}, collect_layers=True
    )
    scarred = scar_result.composed.convert("RGB")

    diff = ImageChops.difference(base, scarred)
    assert diff.getbbox() is not None

    primary_layer = next(
        layer
        for layer in scar_result.layers
        if layer.id == LayerIdentifier.scars_primary
    )
    assert primary_layer.image.getbbox() is not None
    assert "scarsONE" in primary_layer.diagnostics


def test_reverse_preserves_missing_scar_orientation():
    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    params = {
        "spriteNumber": 5,
        "peltName": "SingleColour",
        "colour": "GINGER",
        "scars": ["NOPAW"],
        "reverse": False,
    }
    forward = pipeline.render(params, collect_layers=False).composed.convert("RGBA")

    mirrored_expected = ImageOps.mirror(forward)

    params["reverse"] = True
    reversed_img = pipeline.render(params, collect_layers=False).composed.convert(
        "RGBA"
    )

    assert reversed_img.tobytes() == mirrored_expected.tobytes()


def test_fastapi_health():
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["metrics"]["queue_size"] == 0
    assert body["metrics"]["worker_count"] > 0
    assert body["metrics"]["circuit_open"] is False


def test_render_batch_endpoint():
    app = create_app()

    payload = {
        "payload": {
            "spriteNumber": 5,
            "params": {
                "peltName": "SingleColour",
                "colour": "GINGER",
            },
        },
        "variants": [
            {
                "id": "scarred",
                "label": "Scar",
                "overrides": {"scars": ["ONE"]},
            },
            {
                "id": "accessory",
                "label": "Accessory",
                "overrides": {"accessories": ["BLUEBELL"]},
            },
        ],
        "options": {
            "tileSize": 50,
            "columns": 2,
            "includeSources": True,
        },
    }

    with TestClient(app) as client:
        response = client.post("/render/batch", json=payload)
        health = client.get("/health").json()
    assert response.status_code == 200

    data = response.json()
    assert data["tileSize"] == 50
    assert data["width"] == 100
    assert data["catalogHash"] == health["catalogHash"]
    assert data["manifestHash"] == health["manifestHash"]
    assert data["renderPlanVersion"] == 1
    assert data["frames"][0]["id"] == "base"
    assert len(data["frames"]) == 3  # base + 2 variants
    assert data.get("sources") is not None
    assert len(data["sources"]) == 3


def test_render_batch_layer_mode():
    app = create_app()

    payload = {
        "payload": {
            "spriteNumber": 8,
            "params": {
                "peltName": "Masked",
                "colour": "CHOCOLATE",
                "scars": ["ONE"],
            },
        },
        "variants": [
            {
                "id": "scarred",
                "params": {
                    "scars": ["BURNTAIL"],
                },
            }
        ],
        "options": {
            "frameMode": "layer",
            "layerId": "scarsPrimary",
            "includeBase": False,
            "tileSize": 50,
        },
    }

    with TestClient(app) as client:
        response = client.post("/render/batch", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["tileSize"] == 50
    assert data["frames"][0]["id"] == "scarred"
    sheet = data["sheet"]
    assert sheet.startswith("data:image/png;base64,")
