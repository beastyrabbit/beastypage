from __future__ import annotations

import time
from dataclasses import dataclass
import math
from copy import deepcopy
from pathlib import Path
from typing import List

from PIL import Image

from ..models import (
    LayerIdentifier,
    LayerDiagnostic,
    RenderMeta,
    BatchVariant,
)
from .repository import SpriteRepository
from .sprite_mapper import SpriteMapper
from .v3_renderer import CatRendererV3, StageInfo


@dataclass
class LayerResult:
    id: LayerIdentifier
    label: str
    image: Image.Image
    duration_ms: float
    diagnostics: List[str]
    blend_mode: str


@dataclass
class PipelineResult:
    composed: Image.Image
    layers: List[LayerResult]
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
    frames: List[BatchFrameResult]
    sources: List[tuple[str, Image.Image]]
    tile_size: int


class RenderPipeline:
    """Wrapper around the CatRendererV3 that prepares API responses."""

    def __init__(self, canvas_size: int = 50, repository: SpriteRepository | None = None) -> None:
        self.canvas_size = canvas_size
        self.repository = repository or SpriteRepository(tile_size=canvas_size)
        data_dir = Path(__file__).resolve().parents[1] / "data"
        self.mapper = SpriteMapper(data_dir)
        self.renderer = CatRendererV3(self.repository, self.mapper)

    def render(self, params: dict, collect_layers: bool = False) -> PipelineResult:
        params = {**params}  # shallow copy to avoid side-effects
        params.setdefault("spriteNumber", params.get("sprite_number", 0))

        layer_results: List[LayerResult] = []
        start_time = time.perf_counter()

        composed, stage_infos = self.renderer.render(params)

        if collect_layers:
            for info in stage_infos:
                if info.image is None:
                    continue
                layer_results.append(
                    LayerResult(
                        id=info.identifier,
                        label=info.identifier.value,
                        image=info.image.copy(),
                        duration_ms=0.0,
                        diagnostics=info.diagnostics,
                        blend_mode=info.blend_mode,
                    )
                )

        meta = RenderMeta(
            started_at=start_time,
            finished_at=time.perf_counter(),
            duration_ms=(time.perf_counter() - start_time) * 1000,
            memory_pressure=False,
        )

        return PipelineResult(composed=composed, layers=layer_results, meta=meta)

    # ------------------------------------------------------------------
    def render_batch(
        self,
        base_params: dict,
        variants: List[BatchVariant],
        *,
        include_base: bool = True,
        tile_size: int | None = None,
        columns: int | None = None,
        include_sources: bool = False,
        frame_mode: str = "composed",
        layer_identifier: LayerIdentifier | None = None,
    ) -> BatchPipelineResult:
        normalized_base = self._normalize_params(base_params)

        render_specs: List[tuple[str, str | None, str | None, dict]] = []

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

        images: List[Image.Image] = []
        frame_infos: List[tuple[str, str | None, str | None]] = []
        sources: List[tuple[str, Image.Image]] = []

        for frame_id, label, group, params in render_specs:
            composed, stages = self.renderer.render(params)
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
        frames: List[BatchFrameResult] = []

        for index, (image, info) in enumerate(zip(images, frame_infos)):
            frame_id, label, group = info
            column = index % column_count
            row = index // column_count
            x = column * sheet_tile
            y = row * sheet_tile

            tile = image
            if image.size != (sheet_tile, sheet_tile):
                tile = image.resize((sheet_tile, sheet_tile), Image.NEAREST)

            sheet.paste(tile, (x, y), tile)

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

        return BatchPipelineResult(sheet=sheet, frames=frames, sources=sources, tile_size=sheet_tile)

    # ------------------------------------------------------------------
    def _normalize_params(self, params: dict) -> dict:
        normalized = deepcopy(params)
        normalized.setdefault("spriteNumber", normalized.get("sprite_number", 0))
        return normalized

    # ------------------------------------------------------------------
    def _prepare_variant_params(self, base_params: dict, variant: BatchVariant) -> dict:
        params = deepcopy(base_params)
        if variant.params:
            params.update(deepcopy(variant.params))
        if variant.overrides:
            params.update(deepcopy(variant.overrides))
        if variant.sprite_number is not None:
            params["spriteNumber"] = variant.sprite_number
        params.setdefault("spriteNumber", base_params.get("spriteNumber", 0))
        return params

    # ------------------------------------------------------------------
    @staticmethod
    def _extract_layer_image(stage_infos: List[StageInfo], target: LayerIdentifier) -> Image.Image | None:
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
        return min(total_frames, max(1, int(math.ceil(math.sqrt(total_frames)))))
