from __future__ import annotations

import math
import time
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from ..models import (
    BatchVariant,
    RenderMeta,
)
from .coat_patterns import normalize_coat_pattern_name
from .contracts import CatDocument, RenderPlan
from .executor import (
    DEFAULT_MANIFEST_PATH,
    DEFAULT_PLAN_PATH,
    InvalidRenderPlan,
    RenderExecutor,
    load_render_plan,
)
from .integrity import DEFAULT_INTEGRITY_PATH, verify_bundle_integrity
from .legacy_adapter import (
    BooleanAliasBinding,
    LegacyCatAdapter,
    ListBinding,
    PoseBinding,
)
from .repository import SpriteRepository
from .sprite_mapper import SpriteMapper
from .strategies import STRATEGY_REGISTRY
from .v3_renderer import CatRendererV3, StageInfo


@dataclass
class LayerResult:
    id: str
    operation_id: str | None
    label: str
    image: Image.Image
    duration_ms: float
    diagnostics: list[str]
    blend_mode: str


@dataclass
class PipelineResult:
    composed: Image.Image
    layers: list[LayerResult]
    meta: RenderMeta


@dataclass
class BatchFrameResult:
    id: str
    label: str | None
    group: str | None
    index: int
    column: int
    row: int
    x: int
    y: int
    width: int
    height: int


@dataclass
class BatchPipelineResult:
    sheet: Image.Image
    frames: list[BatchFrameResult]
    sources: list[tuple[str, Image.Image]]
    tile_size: int


class RenderPipeline:
    """Wrapper around the CatRendererV3 that prepares API responses."""

    def __init__(
        self,
        canvas_size: int = 50,
        repository: SpriteRepository | None = None,
        *,
        plan: RenderPlan | None = None,
        plan_path: Path | None = None,
        manifest_path: Path | None = None,
        integrity_path: Path = DEFAULT_INTEGRITY_PATH,
        adapter: LegacyCatAdapter | None = None,
        verify_manifest_file: bool = True,
        verify_static_assets: bool = True,
        verify_bundle: bool = True,
        expected_catalog_hash: str | None = None,
    ) -> None:
        self.canvas_size = canvas_size
        self.repository = repository or SpriteRepository(tile_size=canvas_size)
        generated_dir = integrity_path.parent
        resolved_plan_path = plan_path or generated_dir / DEFAULT_PLAN_PATH.name
        resolved_manifest_path = (
            manifest_path or generated_dir / DEFAULT_MANIFEST_PATH.name
        )
        if verify_bundle:
            if plan is not None or adapter is not None:
                raise InvalidRenderPlan(
                    "Custom plans or adapters require verify_bundle=False because "
                    "they are not part of the generated integrity manifest"
                )
            expected_plan_path = generated_dir / DEFAULT_PLAN_PATH.name
            expected_manifest_path = generated_dir / DEFAULT_MANIFEST_PATH.name
            if (
                resolved_plan_path.resolve() != expected_plan_path.resolve()
                or resolved_manifest_path.resolve() != expected_manifest_path.resolve()
            ):
                raise InvalidRenderPlan(
                    "Verified render plan and strategy manifest must be siblings of "
                    "bundle-integrity.json"
                )
            verify_bundle_integrity(
                integrity_path=integrity_path,
                sprite_root=self.repository.sprite_root,
                data_root=self.repository.data_root,
                expected_catalog_hash=expected_catalog_hash,
            )
        self.mapper = SpriteMapper(self.repository.data_root)
        self.renderer = CatRendererV3(self.repository, self.mapper)
        self.adapter = adapter or LegacyCatAdapter.from_path(
            generated_dir / "compatibility.json",
            generated_dir / "cat-document.schema.json",
        )
        resolved_plan = plan or load_render_plan(resolved_plan_path)
        contract_versions = {
            "render plan": resolved_plan.schema_version,
            "compatibility": self.adapter.manifest.schema_version,
        }
        if self.adapter.document_schema is not None:
            contract_versions["document schema"] = (
                self.adapter.document_schema.schema_version
            )
        if len(set(contract_versions.values())) != 1:
            raise InvalidRenderPlan(
                "Render plan, compatibility and document schemaVersion must match: "
                f"{contract_versions}"
            )
        self.executor = RenderExecutor(
            self.renderer,
            resolved_plan,
            STRATEGY_REGISTRY,
            manifest_path=resolved_manifest_path,
            verify_manifest_file=verify_manifest_file,
            verify_static_assets=verify_static_assets,
            expected_catalog_hash=expected_catalog_hash,
        )

    def render(
        self,
        source: dict | CatDocument,
        collect_layers: bool = False,
    ) -> PipelineResult:
        document = self._coerce_document(source)
        params = self.adapter.to_renderer_params(
            document,
            self.repository.sprite_number_for_pose,
        )
        # Canonical trait IDs remain available to generic strategy handlers while
        # legacy aliases keep the existing pixel implementations byte-compatible.
        params = {**document.traits, **params}
        params = self._normalize_params(params)

        layer_results: list[LayerResult] = []
        start_time = time.perf_counter()

        composed, stage_infos = self.executor.execute(document, params)

        if collect_layers:
            for info in stage_infos:
                if info.image is None:
                    continue
                layer_results.append(
                    LayerResult(
                        id=info.identifier,
                        operation_id=info.operation_id,
                        label=info.identifier,
                        image=info.image.copy(),
                        duration_ms=info.duration_ms,
                        diagnostics=info.diagnostics,
                        blend_mode=info.blend_mode,
                    )
                )

        meta = RenderMeta(
            started_at=start_time,
            finished_at=time.perf_counter(),
            duration_ms=(time.perf_counter() - start_time) * 1000,
            memory_pressure=False,
            catalog_hash=self.executor.metadata.catalog_hash,
            manifest_hash=self.executor.metadata.manifest_hash,
            render_plan_version=self.executor.metadata.format_version,
        )

        return PipelineResult(composed=composed, layers=layer_results, meta=meta)

    # ------------------------------------------------------------------
    def render_batch(
        self,
        base_params: dict,
        variants: list[BatchVariant],
        *,
        include_base: bool = True,
        tile_size: int | None = None,
        columns: int | None = None,
        include_sources: bool = False,
        frame_mode: str = "composed",
        layer_identifier: str | None = None,
    ) -> BatchPipelineResult:
        normalized_base = self._normalize_params(base_params)

        render_specs: list[tuple[str, str | None, str | None, dict]] = []

        if include_base:
            render_specs.append(("base", None, None, normalized_base))

        for variant in variants:
            params = self._prepare_variant_params(normalized_base, variant)
            render_specs.append((variant.id, variant.label, variant.group, params))

        if not render_specs:
            raise ValueError("render_batch requires at least one frame")

        if frame_mode not in {"composed", "layer"}:
            raise ValueError(f"Unsupported frame_mode '{frame_mode}'")
        if frame_mode == "layer" and layer_identifier is None:
            raise ValueError("layer_identifier is required when frame_mode='layer'")

        images: list[Image.Image] = []
        frame_infos: list[tuple[str, str | None, str | None]] = []
        sources: list[tuple[str, Image.Image]] = []

        for frame_id, label, group, params in render_specs:
            document = self._coerce_document(params)
            render_params = self.adapter.to_renderer_params(
                document,
                self.repository.sprite_number_for_pose,
            )
            render_params = {**document.traits, **render_params}
            render_params = self._normalize_params(render_params)
            composed, stages = self.executor.execute(document, render_params)
            if frame_mode == "layer" and layer_identifier is not None:
                overlay = self._extract_layer_image(stages, layer_identifier)
                if overlay is not None:
                    image = overlay
                else:
                    image = self.repository.blank_canvas()
            else:
                image = composed

            images.append(image)
            frame_infos.append((frame_id, label, group))
            if include_sources:
                sources.append((frame_id, image.copy()))

        sheet_tile = tile_size or self.canvas_size
        column_count = self._resolve_columns(len(images), columns)
        row_count = math.ceil(len(images) / column_count)
        sheet_width = column_count * sheet_tile
        sheet_height = row_count * sheet_tile

        sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
        frames: list[BatchFrameResult] = []

        for index, (image, info) in enumerate(zip(images, frame_infos)):
            frame_id, label, group = info
            column = index % column_count
            row = index // column_count
            x = column * sheet_tile
            y = row * sheet_tile

            tile = image
            if image.size != (sheet_tile, sheet_tile):
                tile = image.resize((sheet_tile, sheet_tile), Image.NEAREST)

            sheet.paste(tile, (x, y))

            frames.append(
                BatchFrameResult(
                    id=frame_id,
                    label=label,
                    group=group,
                    index=index,
                    column=column,
                    row=row,
                    x=x,
                    y=y,
                    width=sheet_tile,
                    height=sheet_tile,
                )
            )

        return BatchPipelineResult(
            sheet=sheet, frames=frames, sources=sources, tile_size=sheet_tile
        )

    # ------------------------------------------------------------------
    def _normalize_params(self, params: dict) -> dict:
        normalized = deepcopy(params)
        coat_pattern = normalize_coat_pattern_name(normalized.get("coatPattern"))
        legacy_coat_pattern = normalize_coat_pattern_name(normalized.get("peltName"))
        if coat_pattern or legacy_coat_pattern:
            normalized["peltName"] = "SingleColour"
            normalized["coatPattern"] = coat_pattern or legacy_coat_pattern
        pose_name = normalized.get("poseName") or normalized.get("pose_name")
        sprite_number = normalized.get(
            "spriteNumber", normalized.get("sprite_number", 0)
        )
        if not pose_name:
            pose_name = self.repository.pose_name_for_sprite_number(sprite_number)
        normalized["spriteNumber"] = self.repository.sprite_number_for_pose(
            str(pose_name) if pose_name else None,
            sprite_number,
        )
        if pose_name:
            normalized["poseName"] = str(pose_name)
        return normalized

    # ------------------------------------------------------------------
    def _coerce_document(self, source: dict | CatDocument) -> CatDocument:
        if isinstance(source, CatDocument):
            return self.adapter.normalize_document(source)
        return self.adapter.from_legacy_params(
            deepcopy(source),
            self.repository.pose_name_for_sprite_number,
        )

    # ------------------------------------------------------------------
    def _prepare_variant_params(self, base_params: dict, variant: BatchVariant) -> dict:
        params = deepcopy(base_params)

        def clear_overridden_aliases(update: dict) -> None:
            for trait in self.adapter.manifest.traits:
                binding = trait.legacy
                keys: list[str] = []
                if isinstance(binding, ListBinding):
                    keys = [binding.key] + (
                        [binding.single_key] if binding.single_key else []
                    )
                elif isinstance(binding, BooleanAliasBinding):
                    keys = [binding.key, *binding.aliases]
                elif isinstance(binding, PoseBinding):
                    keys = [
                        binding.key,
                        binding.sprite_key,
                        "pose_name",
                        "sprite_number",
                        "sprite",
                    ]
                if any(key in update for key in keys):
                    for key in keys:
                        params.pop(key, None)

        if variant.params:
            clear_overridden_aliases(variant.params)
            variant_params = deepcopy(variant.params)
            legacy_coat_pattern = normalize_coat_pattern_name(
                variant_params.get("peltName")
            )
            if "peltName" in variant_params and "coatPattern" not in variant_params:
                if legacy_coat_pattern:
                    variant_params["peltName"] = "SingleColour"
                    variant_params["coatPattern"] = legacy_coat_pattern
                else:
                    variant_params["coatPattern"] = None
            params.update(variant_params)
        if variant.overrides:
            clear_overridden_aliases(variant.overrides)
            variant_overrides = deepcopy(variant.overrides)
            legacy_coat_pattern = normalize_coat_pattern_name(
                variant_overrides.get("peltName")
            )
            if (
                "peltName" in variant_overrides
                and "coatPattern" not in variant_overrides
            ):
                if legacy_coat_pattern:
                    variant_overrides["peltName"] = "SingleColour"
                    variant_overrides["coatPattern"] = legacy_coat_pattern
                else:
                    variant_overrides["coatPattern"] = None
            params.update(variant_overrides)
        if variant.pose_name is not None:
            params["poseName"] = variant.pose_name
        if variant.sprite_number is not None:
            if variant.pose_name is None:
                params.pop("poseName", None)
                params.pop("pose_name", None)
            params["spriteNumber"] = variant.sprite_number
        return self._normalize_params(params)

    # ------------------------------------------------------------------
    @staticmethod
    def _extract_layer_image(
        stage_infos: list[StageInfo], target: str
    ) -> Image.Image | None:
        for info in stage_infos:
            if info.identifier == target and info.image is not None:
                return info.image.copy()
        return None

    # ------------------------------------------------------------------
    @staticmethod
    def _resolve_columns(total_frames: int, requested: int | None) -> int:
        if total_frames <= 0:
            return 1
        if requested and requested > 0:
            return min(requested, total_frames)
        return min(total_frames, max(1, math.ceil(math.sqrt(total_frames))))
