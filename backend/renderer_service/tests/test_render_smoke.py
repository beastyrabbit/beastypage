import json
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import ImageOps

from renderer_service.app import create_app
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.repository import SpriteRepository
from renderer_service.models import LayerIdentifier

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open("r", encoding="utf-8") as fh:
        return json.load(fh)


def render_layer_ids(pipeline: RenderPipeline, params: dict) -> tuple[list[LayerIdentifier], list[list[str]]]:
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
        "accessories": ["collarsBLUE"],
    }
    ids, _ = render_layer_ids(pipeline, extras_params)
    assert LayerIdentifier.skin in ids
    assert LayerIdentifier.scars_primary in ids
    assert LayerIdentifier.accessories in ids


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

    accessories_layer = next(layer for layer in result.layers if layer.id == LayerIdentifier.accessories)
    assert any("MAPLE" in note.upper() for note in accessories_layer.diagnostics)

    scars_layer = next(layer for layer in result.layers if layer.id == LayerIdentifier.scars_primary)
    assert any("FROSTSOCK" in note.upper() for note in scars_layer.diagnostics)

    tint_layer = next(layer for layer in result.layers if layer.id == LayerIdentifier.tint)
    assert any(note.startswith("tint") for note in tint_layer.diagnostics)


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
    reversed_img = pipeline.render(params, collect_layers=False).composed.convert("RGBA")

    assert reversed_img.tobytes() == mirrored_expected.tobytes()


def test_fastapi_health():
    app = create_app()
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_render_batch_endpoint():
    app = create_app()
    client = TestClient(app)

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

    response = client.post("/render/batch", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["tileSize"] == 50
    assert data["width"] == 100
    assert data["frames"][0]["id"] == "base"
    assert len(data["frames"]) == 3  # base + 2 variants
    assert data.get("sources") is not None
    assert len(data["sources"]) == 3


def test_render_batch_layer_mode():
    app = create_app()
    client = TestClient(app)

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

    response = client.post("/render/batch", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["tileSize"] == 50
    assert data["frames"][0]["id"] == "scarred"
    sheet = data["sheet"]
    assert sheet.startswith("data:image/png;base64,")
