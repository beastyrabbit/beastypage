from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps
from pydantic import JsonValue

from .contracts import CatDocument, RenderOperation, RenderPlan
from .image_ops import (
    add,
    alpha_over,
    multiply,
    sanitize_transparency,
    screen,
)
from .strategy_registry import StrategyContext, StrategyRegistry
from .v3_renderer import CatRendererV3, StageInfo

GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"
DEFAULT_PLAN_PATH = GENERATED_DIR / "render-plan.json"
DEFAULT_MANIFEST_PATH = GENERATED_DIR / "render-strategies.manifest.json"


class InvalidRenderPlan(ValueError):
    pass


@dataclass(frozen=True)
class ExecutorMetadata:
    schema_version: int
    catalog_hash: str
    manifest_hash: str
    format_version: int


def _load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise InvalidRenderPlan(f"Required render artifact is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise InvalidRenderPlan(
            f"Invalid JSON in render artifact {path}: {exc}"
        ) from exc


def manifest_file_hash(path: Path = DEFAULT_MANIFEST_PATH) -> str:
    try:
        contents = path.read_bytes()
    except FileNotFoundError as exc:
        raise InvalidRenderPlan(f"Render strategy manifest is missing: {path}") from exc
    return hashlib.sha256(contents).hexdigest()


def load_render_plan(path: Path = DEFAULT_PLAN_PATH) -> RenderPlan:
    try:
        return RenderPlan.model_validate(_load_json(path))
    except ValueError as exc:
        if isinstance(exc, InvalidRenderPlan):
            raise
        raise InvalidRenderPlan(f"Render plan validation failed: {exc}") from exc


def _sort_operations(operations: list[RenderOperation]) -> tuple[RenderOperation, ...]:
    by_id: dict[str, RenderOperation] = {}
    for operation in operations:
        if operation.id in by_id:
            raise InvalidRenderPlan(f"Duplicate render operation '{operation.id}'")
        by_id[operation.id] = operation

    indegree: dict[str, int] = {operation.id: 0 for operation in operations}
    dependents: dict[str, list[str]] = {}
    for operation in operations:
        unique_dependencies = set(operation.depends_on)
        if len(unique_dependencies) != len(operation.depends_on):
            raise InvalidRenderPlan(
                f"Operation '{operation.id}' contains duplicate dependencies"
            )
        if operation.id in unique_dependencies:
            raise InvalidRenderPlan(f"Operation '{operation.id}' depends on itself")
        for dependency in operation.depends_on:
            if dependency not in by_id:
                raise InvalidRenderPlan(
                    f"Operation '{operation.id}' depends on unknown '{dependency}'"
                )
            dependents.setdefault(dependency, []).append(operation.id)
            indegree[operation.id] += 1

    def sort_key(operation_id: str) -> tuple[int, str]:
        operation = by_id[operation_id]
        return operation.order, operation.id

    ready = sorted(
        (operation_id for operation_id, degree in indegree.items() if degree == 0),
        key=sort_key,
    )
    ordered: list[RenderOperation] = []
    while ready:
        operation_id = ready.pop(0)
        ordered.append(by_id[operation_id])
        for dependent in dependents.get(operation_id, []):
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                ready.append(dependent)
                ready.sort(key=sort_key)

    if len(ordered) != len(operations):
        cyclic = sorted(
            operation_id for operation_id, degree in indegree.items() if degree > 0
        )
        raise InvalidRenderPlan(
            "Render operation dependency graph contains a cycle: " + ", ".join(cyclic)
        )
    return tuple(ordered)


class RenderExecutor:
    def __init__(
        self,
        renderer: CatRendererV3,
        plan: RenderPlan,
        registry: StrategyRegistry,
        *,
        manifest_path: Path = DEFAULT_MANIFEST_PATH,
        verify_manifest_file: bool = True,
        verify_static_assets: bool = True,
        expected_catalog_hash: str | None = None,
    ) -> None:
        self.renderer = renderer
        self.plan = plan
        self.registry = registry

        if verify_manifest_file:
            registry.check_manifest(manifest_path)
            actual_manifest_hash = manifest_file_hash(manifest_path)
        else:
            actual_manifest_hash = registry.manifest_sha256()
        if plan.manifest_hash != actual_manifest_hash:
            raise InvalidRenderPlan(
                "Render plan manifestHash does not match the registered Python "
                f"strategies ({plan.manifest_hash} != {actual_manifest_hash})"
            )

        configured_catalog_hash = (
            expected_catalog_hash
            if expected_catalog_hash is not None
            else os.getenv("CAT_SYSTEM_CATALOG_HASH", "unknown")
        ).strip()
        if (
            configured_catalog_hash != "unknown"
            and re.fullmatch(r"[a-f0-9]{64}", configured_catalog_hash) is None
        ):
            raise InvalidRenderPlan(
                "CAT_SYSTEM_CATALOG_HASH must be 'unknown' for local runs or a "
                "64-character lowercase SHA-256 hash"
            )
        if configured_catalog_hash not in {"unknown", plan.catalog_hash}:
            raise InvalidRenderPlan(
                "CAT_SYSTEM_CATALOG_HASH does not match render plan catalogHash "
                f"({configured_catalog_hash} != {plan.catalog_hash})"
            )

        for operation in plan.operations:
            definition = registry.resolve(
                operation.strategy,
                operation.strategy_version,
            )
            if not isinstance(operation.config, definition.config_model):
                raise InvalidRenderPlan(
                    f"Operation '{operation.id}' config does not match "
                    f"{operation.strategy}@{operation.strategy_version}"
                )
            declared_reads = set(operation.reads)
            config_dump = operation.config.model_dump(by_alias=True)
            for input_key in ("valueTrait", "tintTrait"):
                value = config_dump.get(input_key)
                if isinstance(value, str) and value not in declared_reads:
                    raise InvalidRenderPlan(
                        f"Operation '{operation.id}' reads '{value}' through config "
                        "but does not declare it in reads"
                    )

        self.operations = _sort_operations(plan.operations)
        if verify_static_assets:
            self._validate_static_assets(plan)
        catalogs = {
            catalog_id: {
                entry.id: entry.model_dump(by_alias=True, exclude_none=True)
                for entry in entries
            }
            for catalog_id, entries in plan.catalogs.items()
        }
        self.strategy_context = StrategyContext(
            renderer=renderer,
            catalogs=catalogs,
        )
        self.metadata = ExecutorMetadata(
            schema_version=plan.schema_version,
            catalog_hash=plan.catalog_hash,
            manifest_hash=actual_manifest_hash,
            format_version=plan.format_version,
        )

    def _validate_static_assets(self, plan: RenderPlan) -> None:
        missing_files = self.renderer.repo.missing_indexed_assets()
        if missing_files:
            sample = ", ".join(missing_files[:10])
            raise InvalidRenderPlan(
                f"{len(missing_files)} indexed sprite assets are missing. "
                f"Sample: {sample}"
            )

        sprite_keys: set[str] = set()
        fallback_groups: list[tuple[str, list[str]]] = []
        for entries in plan.catalogs.values():
            sprite_keys.update(
                entry.sprite_key for entry in entries if entry.sprite_key is not None
            )
        for operation in plan.operations:
            config = operation.config.model_dump(by_alias=True)
            raw_keys = config.get("spriteKeys")
            if isinstance(raw_keys, list):
                fallback_groups.append((operation.id, [str(key) for key in raw_keys]))
            for mapping_key in ("spriteByValue", "sprites"):
                mapping = config.get(mapping_key)
                if isinstance(mapping, dict):
                    sprite_keys.update(
                        str(key) for key in mapping.values() if isinstance(key, str)
                    )

        missing_keys = sorted(
            sprite_key
            for sprite_key in sprite_keys
            if not self.renderer.repo.has_sprite(sprite_key)
        )
        if missing_keys:
            sample = ", ".join(missing_keys[:10])
            raise InvalidRenderPlan(
                f"{len(missing_keys)} render-plan sprite references are missing. "
                f"Sample: {sample}"
            )

        missing_groups = [
            (operation_id, keys)
            for operation_id, keys in fallback_groups
            if not any(self.renderer.repo.has_sprite(key) for key in keys)
        ]
        if missing_groups:
            sample = ", ".join(
                f"{operation_id} ({' | '.join(keys)})"
                for operation_id, keys in missing_groups[:10]
            )
            raise InvalidRenderPlan(
                f"{len(missing_groups)} render-plan sprite fallback groups have no "
                f"available asset. Sample: {sample}"
            )

    def execute(
        self,
        document: CatDocument,
        params: dict[str, JsonValue],
    ) -> tuple[Image.Image, list[StageInfo]]:
        canvas = self.renderer.repo.blank_canvas()
        stages: list[StageInfo] = []

        for operation in self.operations:
            definition = self.registry.resolve(
                operation.strategy,
                operation.strategy_version,
            )
            started = time.perf_counter()
            result = definition.handler(
                self.strategy_context,
                operation,
                operation.config,
                params,
                canvas,
            )
            duration_ms = (time.perf_counter() - started) * 1000
            if result.image is None:
                continue

            if result.blend_mode == "alpha":
                canvas = alpha_over(canvas, result.image)
            elif result.blend_mode == "multiply":
                canvas = multiply(canvas, result.image)
            elif result.blend_mode == "screen":
                canvas = screen(canvas, result.image)
            elif result.blend_mode == "add":
                canvas = add(canvas, result.image)
            elif result.blend_mode == "replace":
                canvas = result.image
            else:  # pragma: no cover - Pydantic makes this unreachable
                raise InvalidRenderPlan(f"Unsupported blend mode '{result.blend_mode}'")

            if result.transform_previous_layers:
                for stage in stages:
                    if stage.image is not None:
                        stage.image = ImageOps.mirror(stage.image)

            stages.append(
                StageInfo(
                    identifier=operation.layer_id,
                    operation_id=operation.id,
                    diagnostics=result.diagnostic_entries(),
                    image=result.image,
                    blend_mode=result.blend_mode,
                    duration_ms=duration_ms,
                )
            )

        return sanitize_transparency(canvas), stages


__all__ = [
    "DEFAULT_MANIFEST_PATH",
    "DEFAULT_PLAN_PATH",
    "ExecutorMetadata",
    "InvalidRenderPlan",
    "RenderExecutor",
    "load_render_plan",
    "manifest_file_hash",
]
