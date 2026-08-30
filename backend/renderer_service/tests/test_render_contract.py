from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from renderer_service.app import create_app
from renderer_service.config import settings
from renderer_service.render_contract import check_manifest
from renderer_service.renderer.contracts import (
    CatDocument,
    RenderCatalogEntry,
    RenderPlan,
)
from renderer_service.renderer.document_schema import InvalidCatDocument
from renderer_service.renderer.executor import (
    InvalidRenderPlan,
    RenderExecutor,
    load_render_plan,
)
from renderer_service.renderer.integrity import verify_bundle_integrity
from renderer_service.renderer.legacy_adapter import (
    CompatibilityManifest,
    LegacyCatAdapter,
)
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.repository import SpriteRepository
from renderer_service.renderer.sprite_mapper import SpriteMapper
from renderer_service.renderer.strategies import STRATEGY_REGISTRY
from renderer_service.renderer.v3_renderer import CatRendererV3

GENERATED_DIR = Path(__file__).resolve().parents[1] / "renderer_service" / "generated"
EAR_ACCESSORY_PROBE_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "lib"
    / "cat-system"
    / "testing"
    / "fixtures"
    / "cat-system-ear-accessory-probe.generated.json"
)
EXPECTED_STRATEGIES = {
    "basePelt",
    "coatPattern",
    "tintMultiply",
    "spriteLayer",
    "eyes",
    "scarPrimary",
    "booleanSpriteLayer",
    "solidMultiply",
    "lineart",
    "scarSecondary",
    "catalogSpriteList",
    "globalMirror",
}


def _operation(
    operation_id: str,
    *,
    depends_on: list[str] | None = None,
    order: int = 0,
) -> dict:
    return {
        "id": operation_id,
        "layerId": operation_id,
        "strategy": "basePelt",
        "strategyVersion": 1,
        "dependsOn": depends_on or [],
        "order": order,
        "reads": ["pelt", "colour", "tortie"],
        "config": {},
    }


def _plan(operations: list[dict], *, manifest_hash: str | None = None) -> RenderPlan:
    return RenderPlan.model_validate(
        {
            "formatVersion": 1,
            "schemaVersion": 1,
            "catalogHash": "0" * 64,
            "manifestHash": manifest_hash or STRATEGY_REGISTRY.manifest_sha256(),
            "operations": operations,
        }
    )


def _renderer() -> CatRendererV3:
    repository = SpriteRepository()
    return CatRendererV3(repository, SpriteMapper(repository.data_root))


def _copy_generated_bundle(tmp_path: Path) -> Path:
    destination = tmp_path / "generated"
    shutil.copytree(GENERATED_DIR, destination)
    return destination


def _compatibility_manifest(extra_traits: list[dict] | None = None):
    traits = [
        {
            "id": "pose",
            "valueKind": "string",
            "required": True,
            "default": "adult_short0",
            "legacy": {
                "strategy": "pose",
                "key": "poseName",
                "spriteKey": "spriteNumber",
            },
        },
        {
            "id": "pelt",
            "valueKind": "string",
            "required": True,
            "default": "SingleColour",
            "legacy": {"strategy": "direct", "key": "peltName"},
        },
        {
            "id": "colour",
            "valueKind": "string",
            "required": True,
            "default": "WHITE",
            "legacy": {"strategy": "direct", "key": "colour"},
        },
        {
            "id": "tortie",
            "valueKind": "objectList",
            "required": False,
            "default": [],
            "legacy": {"strategy": "tortie"},
        },
        *(extra_traits or []),
    ]
    return CompatibilityManifest.model_validate(
        {
            "formatVersion": 1,
            "schemaVersion": 1,
            "aliases": {},
            "tombstones": {},
            "traits": traits,
        }
    )


def test_checked_manifest_is_generated_from_registered_handlers():
    path = GENERATED_DIR / "render-strategies.manifest.json"
    check_manifest(path)
    manifest = json.loads(path.read_text(encoding="utf-8"))

    assert {entry["key"] for entry in manifest["strategies"]} == EXPECTED_STRATEGIES
    assert all(entry["version"] == 1 for entry in manifest["strategies"])
    assert all(entry["configSchema"] for entry in manifest["strategies"])


def test_generated_catalog_hash_is_reproduced_by_python_integrity_verifier():
    manifest = json.loads(
        (GENERATED_DIR / "bundle-integrity.json").read_text(encoding="utf-8")
    )
    metadata = verify_bundle_integrity(
        sprite_root=settings.sprite_root,
        data_root=settings.data_root,
    )

    assert metadata.catalog_hash == manifest["catalogHash"]
    assert metadata.schema_version == manifest["schemaVersion"]


def test_render_catalog_accepts_shared_selection_metadata():
    entry = RenderCatalogEntry.model_validate(
        {
            "id": "EAR-FERN",
            "label": "Ear Fern",
            "deprecated": True,
            "weight": 2.5,
        }
    )

    assert entry.deprecated is True
    assert entry.weight == 2.5


def test_executor_sorts_dag_stably_and_rejects_invalid_graphs():
    renderer = _renderer()
    plan = _plan(
        [
            _operation("second", depends_on=["first"], order=10),
            _operation("third", depends_on=["first"], order=20),
            _operation("first", order=30),
        ]
    )
    executor = RenderExecutor(
        renderer,
        plan,
        STRATEGY_REGISTRY,
        verify_manifest_file=False,
    )
    assert [operation.id for operation in executor.operations] == [
        "first",
        "second",
        "third",
    ]

    with pytest.raises(InvalidRenderPlan, match="unknown"):
        RenderExecutor(
            renderer,
            _plan([_operation("only", depends_on=["missing"])]),
            STRATEGY_REGISTRY,
            verify_manifest_file=False,
        )

    with pytest.raises(InvalidRenderPlan, match="cycle"):
        RenderExecutor(
            renderer,
            _plan(
                [
                    _operation("first", depends_on=["second"]),
                    _operation("second", depends_on=["first"]),
                ]
            ),
            STRATEGY_REGISTRY,
            verify_manifest_file=False,
        )


def test_executor_rejects_a_plan_built_for_another_manifest():
    with pytest.raises(InvalidRenderPlan, match="manifestHash"):
        RenderExecutor(
            _renderer(),
            _plan([_operation("base")], manifest_hash="f" * 64),
            STRATEGY_REGISTRY,
            verify_manifest_file=False,
        )


def test_executor_validates_static_mappings_and_fallback_groups():
    renderer = _renderer()
    missing_mapping = {
        "id": "futureMapping",
        "layerId": "futureMapping",
        "strategy": "spriteLayer",
        "strategyVersion": 1,
        "dependsOn": [],
        "order": 0,
        "reads": ["whitePatches"],
        "config": {
            "valueTrait": "whitePatches",
            "spriteFamily": "white",
            "spriteByValue": {"future-value": "__missing_static_sprite__"},
        },
    }
    with pytest.raises(InvalidRenderPlan, match="sprite references are missing"):
        RenderExecutor(
            renderer,
            _plan([missing_mapping]),
            STRATEGY_REGISTRY,
            verify_manifest_file=False,
        )

    fallback = {
        "id": "fallback",
        "layerId": "fallback",
        "strategy": "booleanSpriteLayer",
        "strategyVersion": 1,
        "dependsOn": [],
        "order": 0,
        "reads": ["lighting"],
        "config": {
            "valueTrait": "lighting",
            "spriteKeys": ["__missing_static_sprite__", "lighting"],
            "diagnostic": "fallback",
        },
    }
    RenderExecutor(
        renderer,
        _plan([fallback]),
        STRATEGY_REGISTRY,
        verify_manifest_file=False,
    )

    fallback["config"]["spriteKeys"] = [
        "__missing_static_sprite__",
        "__also_missing__",
    ]
    with pytest.raises(InvalidRenderPlan, match="fallback groups"):
        RenderExecutor(
            renderer,
            _plan([fallback]),
            STRATEGY_REGISTRY,
            verify_manifest_file=False,
        )


def test_renderer_startup_rejects_catalog_hash_mismatch(monkeypatch):
    plan = load_render_plan()
    wrong_hash = "f" * 64 if plan.catalog_hash != "f" * 64 else "e" * 64
    monkeypatch.setenv("CAT_SYSTEM_CATALOG_HASH", wrong_hash)

    with pytest.raises(InvalidRenderPlan, match="CAT_SYSTEM_CATALOG_HASH"):
        create_app()

    monkeypatch.setenv("CAT_SYSTEM_CATALOG_HASH", "unknown")
    app = create_app()
    assert app.title == "Cat Generator V3 Renderer"


@pytest.mark.parametrize(
    "filename",
    [
        "cat-document.schema.json",
        "compatibility.json",
        "public-cat-catalog.json",
        "render-plan.json",
        "render-strategies.manifest.json",
    ],
)
def test_pipeline_rejects_generated_contract_drift(tmp_path, filename):
    generated = _copy_generated_bundle(tmp_path)
    artifact = generated / filename
    artifact.write_bytes(artifact.read_bytes() + b" ")

    with pytest.raises(InvalidRenderPlan, match=rf"{re.escape(filename)} drifted"):
        RenderPipeline(integrity_path=generated / "bundle-integrity.json")


def test_pipeline_rejects_schema_version_drift_before_render(tmp_path):
    generated = _copy_generated_bundle(tmp_path)
    plan_path = generated / "render-plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["schemaVersion"] += 1
    plan_path.write_text(json.dumps(plan), encoding="utf-8")

    with pytest.raises(InvalidRenderPlan, match="Bundle schemaVersion mismatch"):
        RenderPipeline(integrity_path=generated / "bundle-integrity.json")


def test_pipeline_rejects_runtime_sprite_data_drift(tmp_path):
    data_root = tmp_path / "sprite-data"
    data_root.mkdir()
    for source in settings.data_root.iterdir():
        if source.is_file() and source.suffix == ".json":
            shutil.copy2(source, data_root / source.name)
    tint_path = data_root / "tint.json"
    tint_path.write_bytes(tint_path.read_bytes() + b" ")
    repository = SpriteRepository(data_root=data_root)

    with pytest.raises(InvalidRenderPlan, match="spriteData asset tree drifted"):
        RenderPipeline(repository=repository)


def test_pipeline_rejects_runtime_palette_drift(tmp_path):
    data_root = tmp_path / "sprite-data"
    data_root.mkdir()
    for source in settings.data_root.iterdir():
        if source.is_file() and source.suffix == ".json":
            shutil.copy2(source, data_root / source.name)
    packaged_palettes = (
        Path(__file__).resolve().parents[1] / "renderer_service" / "data" / "palettes"
    )
    shutil.copytree(packaged_palettes, data_root / "palettes")
    palette_path = next((data_root / "palettes").glob("*.json"))
    palette = json.loads(palette_path.read_text(encoding="utf-8"))
    palette["label"] += " drift"
    palette_path.write_text(json.dumps(palette), encoding="utf-8")
    repository = SpriteRepository(data_root=data_root)

    with pytest.raises(InvalidRenderPlan, match="palettes asset tree drifted"):
        RenderPipeline(repository=repository)


def test_pipeline_rejects_missing_canonical_sprite(tmp_path):
    sprite_root = tmp_path / "sprites"
    shutil.copytree(settings.sprite_root, sprite_root, copy_function=shutil.copy2)
    next(sprite_root.rglob("*.png")).unlink()
    repository = SpriteRepository(sprite_root=sprite_root)

    with pytest.raises(InvalidRenderPlan, match="sprites asset tree drifted"):
        RenderPipeline(repository=repository)


def test_custom_pipeline_requires_matching_contract_versions():
    plan_payload = _plan([_operation("base")]).model_dump(by_alias=True)
    plan_payload["schemaVersion"] = 2

    with pytest.raises(InvalidRenderPlan, match="schemaVersion must match"):
        RenderPipeline(
            repository=SpriteRepository(),
            plan=RenderPlan.model_validate(plan_payload),
            adapter=LegacyCatAdapter(_compatibility_manifest()),
            verify_bundle=False,
            verify_manifest_file=False,
        )


def test_generated_schema_rejects_invalid_known_trait_values():
    adapter = LegacyCatAdapter.from_path()

    with pytest.raises(InvalidCatDocument, match=r"traits\.colour"):
        adapter.normalize_document(
            CatDocument(
                schemaVersion=1,
                traits={
                    "pose": "adult_short1",
                    "pelt": "SingleColour",
                    "colour": ["GINGER"],
                },
            )
        )

    with pytest.raises(InvalidCatDocument, match=r"tortie\[0\]\.colour is required"):
        adapter.normalize_document(
            CatDocument(
                schemaVersion=1,
                traits={
                    "pose": "adult_short1",
                    "pelt": "SingleColour",
                    "colour": "GINGER",
                    "tortie": [{"mask": "ONE", "pattern": "SingleColour"}],
                },
            )
        )


def test_generated_schema_rejects_structurally_duplicate_unique_items():
    adapter = LegacyCatAdapter.from_path()
    base_traits = {
        "pose": "adult_short1",
        "pelt": "SingleColour",
        "colour": "GINGER",
    }

    with pytest.raises(InvalidCatDocument, match=r"accessories.*requires unique items"):
        adapter.normalize_document(
            CatDocument(
                schemaVersion=1,
                traits={**base_traits, "accessories": ["FERN", "FERN"]},
            )
        )

    with pytest.raises(InvalidCatDocument, match=r"tortie.*requires unique items"):
        adapter.normalize_document(
            CatDocument(
                schemaVersion=1,
                traits={
                    **base_traits,
                    "tortie": [
                        {
                            "mask": "ONE",
                            "pattern": "SingleColour",
                            "colour": "BLACK",
                        },
                        {
                            "colour": "BLACK",
                            "pattern": "SingleColour",
                            "mask": "ONE",
                        },
                    ],
                },
            )
        )


def test_future_document_traits_are_preserved_but_not_activated():
    adapter = LegacyCatAdapter.from_path()
    future_value = {"slots": ["EAR-FERN"]}

    normalized = adapter.normalize_document(
        CatDocument(
            schemaVersion=2,
            traits={
                "pose": "adult_short1",
                "pelt": "SingleColour",
                "colour": "GINGER",
                "earAccessory": future_value,
            },
            unknownTraits={"futureMetadata": 2},
        )
    )

    assert normalized.schema_version == adapter.manifest.schema_version
    assert "earAccessory" not in normalized.traits
    assert normalized.unknown_traits == {
        "futureMetadata": 2,
        "earAccessory": future_value,
    }


def test_legacy_optional_string_sentinels_are_absent_before_validation():
    adapter = LegacyCatAdapter.from_path()
    document = adapter.from_legacy_params(
        {
            "poseName": "adult_short1",
            "peltName": "SingleColour",
            "colour": "WHITE",
            "coatPattern": "none",
            "eyeColour2": "NULL",
            "whitePatches": " none ",
            "points": "",
            "vitiligo": " null ",
            "tint": "none",
            "whitePatchesTint": "none",
        },
        SpriteRepository().pose_name_for_sprite_number,
    )

    for trait_id in (
        "coatPattern",
        "eyeColour2",
        "whitePatches",
        "points",
        "vitiligo",
    ):
        assert trait_id not in document.traits
    assert document.traits["tint"] == "none"
    assert document.traits["whitePatchesTint"] == "none"


def test_local_repository_and_mapper_share_frontend_sprite_metadata():
    frontend_data = (
        Path(__file__).resolve().parents[3] / "frontend" / "public" / "sprite-data"
    ).resolve()
    repository = SpriteRepository()
    pipeline = RenderPipeline(repository=repository)

    assert settings.data_root.resolve() == frontend_data
    assert repository.data_root.resolve() == frontend_data
    assert pipeline.mapper.data_dir.resolve() == frontend_data


def test_legacy_adapter_and_document_are_render_equivalent():
    adapter = LegacyCatAdapter(_compatibility_manifest())
    legacy = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "colour": "GINGER",
    }
    document = adapter.from_legacy_params(
        legacy,
        SpriteRepository().pose_name_for_sprite_number,
    )
    plan = _plan([_operation("base")])
    pipeline = RenderPipeline(
        repository=SpriteRepository(),
        plan=plan,
        adapter=adapter,
        verify_bundle=False,
        verify_manifest_file=False,
    )

    from_legacy = pipeline.render(legacy).composed
    from_document = pipeline.render(document).composed
    assert from_legacy.tobytes() == from_document.tobytes()


def test_probe_list_trait_renders_through_mapping_without_python_trait_code():
    fixture = json.loads(EAR_ACCESSORY_PROBE_FIXTURE.read_text(encoding="utf-8"))
    probe_id = fixture["probeId"]
    adapter = LegacyCatAdapter(
        CompatibilityManifest.model_validate(fixture["compatibility"])
    )
    plan = RenderPlan.model_validate(fixture["renderPlan"])
    pipeline = RenderPipeline(
        repository=SpriteRepository(),
        plan=plan,
        adapter=adapter,
        verify_bundle=False,
        verify_manifest_file=False,
    )
    base_document = CatDocument.model_validate(fixture["baseDocument"])
    probe_document = CatDocument.model_validate(fixture["renderDocument"])

    probe_operation = next(
        operation
        for operation in fixture["renderPlan"]["operations"]
        if operation["id"] == probe_id
    )
    probe_compatibility = next(
        trait for trait in fixture["compatibility"]["traits"] if trait["id"] == probe_id
    )
    assert fixture["generatedBy"] == "frontend/scripts/generate-cat-system-probe.ts"
    assert fixture["probeDefinition"]["id"] == probe_id
    assert fixture["probeDefinition"]["value"]["catalog"] == probe_id
    assert probe_operation["layerId"] == probe_id
    assert probe_operation["config"]["valueTrait"] == probe_id
    assert probe_operation["config"]["catalog"] == probe_id
    assert probe_compatibility["id"] == probe_id
    assert probe_id in fixture["renderPlan"]["catalogs"]
    assert base_document.traits[probe_id] == []
    assert probe_document.traits[probe_id] == ["wisteria-ear"]

    base = pipeline.render(base_document).composed
    probe = pipeline.render(probe_document, collect_layers=True)

    assert probe.composed.tobytes() != base.tobytes()
    assert probe_id in [layer.id for layer in probe.layers]


def test_dual_api_envelope_prefers_document_and_reports_contract_hashes():
    app = create_app()
    document = {
        "schemaVersion": 1,
        "traits": {
            "pose": "adult_short1",
            "pelt": "SingleColour",
            "colour": "GINGER",
        },
    }
    with TestClient(app) as client:
        canonical = client.post("/render", json={"payload": {"document": document}})
        dual = client.post(
            "/render",
            json={
                "payload": {
                    "document": document,
                    "params": {
                        "peltName": "SingleColour",
                        "colour": "BLACK",
                    },
                }
            },
        )
        legacy = client.post(
            "/render",
            json={
                "payload": {
                    "poseName": "adult_short1",
                    "params": {
                        "peltName": "SingleColour",
                        "colour": "BLACK",
                    },
                }
            },
        )
        health = client.get("/health")

    assert canonical.status_code == dual.status_code == legacy.status_code == 200
    assert dual.json()["image"] == canonical.json()["image"]
    assert dual.json()["image"] != legacy.json()["image"]
    assert canonical.json()["meta"]["catalogHash"] == health.json()["catalogHash"]
    assert canonical.json()["meta"]["manifestHash"] == health.json()["manifestHash"]
    assert health.json()["renderPlanVersion"] == 1
