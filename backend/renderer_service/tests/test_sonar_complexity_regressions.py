from copy import deepcopy

import pytest
from PIL import Image

from renderer_service.models import BatchVariant
from renderer_service.renderer.contracts import CatDocument
from renderer_service.renderer.document_schema import (
    CatDocumentSchema,
    InvalidCatDocument,
)
from renderer_service.renderer.legacy_adapter import (
    CompatibilityManifest,
    LegacyCatAdapter,
)
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.sprite_mapper import SpriteMapper


@pytest.fixture(scope="module")
def pipeline():
    return RenderPipeline()


def test_legacy_bindings_preserve_absence_aliases_and_nested_values():
    bindings = [
        ("optional", "string", {"strategy": "direct", "key": "optional"}),
        (
            "items",
            "stringList",
            {"strategy": "list", "key": "items", "singleKey": "item"},
        ),
        (
            "pose",
            "string",
            {"strategy": "pose", "key": "poseName", "spriteKey": "spriteNumber"},
        ),
        ("tortie", "objectList", {"strategy": "tortie"}),
        (
            "enabled",
            "boolean",
            {"strategy": "booleanAlias", "key": "enabled", "aliases": ["on"]},
        ),
    ]
    manifest = CompatibilityManifest.model_validate(
        {
            "formatVersion": 1,
            "schemaVersion": 1,
            "traits": [
                {"id": name, "valueKind": kind, "required": False, "legacy": binding}
                for name, kind, binding in bindings
            ],
        }
    )
    adapter = LegacyCatAdapter(manifest)
    params = {
        "optional": " null ",
        "items": [" A ", "a", "none", 3],
        "item": "B",
        "poseName": " ",
        "spriteNumber": "8",
        "enabled": False,
        "on": "yes",
        "tortie": [
            {"mask": "ONE", "pattern": "SingleColour", "colour": "GINGER"},
            "invalid",
        ],
        "future": {"nested": [1]},
    }
    before = deepcopy(params)
    document = adapter.from_legacy_params(params, lambda number: f"pose{number}")
    assert document.traits == {
        "items": ["A", "B"],
        "pose": "pose8",
        "enabled": True,
        "tortie": [params["tortie"][0]],
    }
    assert document.unknown_traits == {"future": {"nested": [1]}}
    output = adapter.to_renderer_params(document, lambda name, fallback: 8)
    assert output == {
        "items": ["A", "B"],
        "item": "A",
        "poseName": "pose8",
        "spriteNumber": 8,
        "tortie": [params["tortie"][0]],
        "isTortie": True,
        "tortieMask": "ONE",
        "tortiePattern": "SingleColour",
        "tortieColour": "GINGER",
        "enabled": True,
        "on": True,
    }
    output["tortie"][0]["mask"] = "TWO"
    document.unknown_traits["future"]["nested"].append(2)
    assert params == before
    assert document.traits["tortie"][0]["mask"] == "ONE"
    empty = adapter.from_legacy_params(
        {"items": [], "enabled": False, "isTortie": False}, lambda _: None
    )
    assert empty.traits == {"items": [], "enabled": False, "tortie": []}
    assert adapter.from_legacy_params({}, lambda _: None).traits == {}


@pytest.mark.parametrize("value", ["ok", None, 3])
def test_schema_alternatives_and_reference_accept_valid_values(value):
    schema = _alternative_schema()
    schema.validate(CatDocument(schemaVersion=1, traits={"choice": value}))


@pytest.mark.parametrize("value", [False, -1, "no", [], {}])
def test_schema_alternatives_preserve_rejection(value):
    schema = _alternative_schema()
    with pytest.raises(InvalidCatDocument, match="does not match any allowed schema"):
        schema.validate(CatDocument(schemaVersion=1, traits={"choice": value}))


def _alternative_schema():
    return CatDocumentSchema(
        {
            "properties": {
                "schemaVersion": {"const": 1},
                "traits": {"properties": {"choice": {"$ref": "#/$defs/choice"}}},
            },
            "$defs": {
                "choice": {
                    "anyOf": [
                        False,
                        {"const": "ok"},
                        {"type": ["integer", "null"], "minimum": 0},
                    ]
                }
            },
        }
    )


def test_variant_update_order_and_inputs_are_preserved(pipeline):
    base = {
        "spriteNumber": 5,
        "accessories": ["RED FEATHERS"],
        "accessory": "RED FEATHERS",
    }
    variant = BatchVariant(
        id="layered",
        params={"accessory": "BLUE FEATHERS", "peltName": "Tabby"},
        overrides={"accessories": [], "peltName": "SingleColour"},
    )
    original_base, original_variant = deepcopy(base), variant.model_copy(deep=True)
    actual = pipeline._prepare_variant_params(base, variant)
    assert actual["accessories"] == []
    assert "accessory" not in actual
    assert actual["coatPattern"] is None
    assert actual["peltName"] == "SingleColour"
    assert base == original_base
    assert variant == original_variant


def test_missing_batch_layer_is_transparent_and_sources_are_independent(
    pipeline, monkeypatch
):
    composed = Image.new("RGBA", (50, 50), (255, 0, 0, 255))
    monkeypatch.setattr(pipeline.executor, "execute", lambda *_: (composed, []))
    result = pipeline.render_batch(
        {"spriteNumber": 5},
        [],
        frame_mode="layer",
        layer_identifier="missing",
        include_sources=True,
        tile_size=25,
    )
    assert result.sheet.size == (25, 25)
    assert result.sheet.getbbox() is None
    assert result.sources[0][1].size == (50, 50)
    result.sources[0][1].putpixel((0, 0), (255, 0, 0, 255))
    assert result.sheet.getbbox() is None


def test_accessory_resolution_preserves_candidate_precedence():
    mapper = object.__new__(SpriteMapper)
    mapper.accessory_sprite_names = {
        "Mint",
        "MINT",
        "alias",
        "collar",
        "acc_plantsMint",
        "acc_herbsMint",
        "MintLeaf",
    }
    mapper.accessory_sprite_aliases = {"MINT": "alias"}
    mapper.collar_sprite_aliases = {"MINT": "collar"}
    mapper.collar_accessories = set()
    mapper.plant_accessories = {"MINT"}
    mapper.wild_accessories = set()
    mapper.tail_accessories = set()
    mapper.accessory_lookup = {"MINT": "fallback"}
    for expected in (
        "Mint",
        "MINT",
        "alias",
        "collar",
        "acc_plantsMint",
        "acc_herbsMint",
    ):
        assert mapper.accessory_sprite_name(" Mint ") == expected
        mapper.accessory_sprite_names.remove(expected)
    assert mapper.accessory_sprite_name(" Mint ") == "fallback"
    assert mapper.accessory_sprite_name("Mint Leaf") == "MintLeaf"
    assert mapper.accessory_sprite_name("unknown") is None
    assert mapper.accessory_sprite_name("") is None


@pytest.mark.parametrize(
    "family,name,colour,expected",
    [
        ("pelt", "TwoColour", None, "singleWHITE"),
        ("pelt", "Tabby", "GINGER", "tabbyGINGER"),
        ("eyes", None, "BLUE", "eyesBLUE"),
        ("white", "ONE", None, "whiteONE"),
        ("scars", "ONE", None, "scarsONE"),
        ("tortie", "ONE", None, "tortiemaskONE"),
        ("accessory", "", None, ""),
        ("unknown", None, None, None),
    ],
)
def test_sprite_family_names(family, name, colour, expected):
    mapper = object.__new__(SpriteMapper)
    assert mapper.build_sprite_name(family, name, colour) == expected
