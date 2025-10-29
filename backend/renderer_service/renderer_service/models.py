from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict


class LayerIdentifier(str, Enum):
    base = "base"
    tint = "tint"
    white_patches = "whitePatches"
    points = "points"
    vitiligo = "vitiligo"
    eyes = "eyes"
    scars_primary = "scarsPrimary"
    scars_secondary = "scarsSecondary"
    skin = "skin"
    lineart = "lineart"
    accessories = "accessories"
    lighting = "lighting"
    transform = "transform"
    output = "output"


class RenderOptions(BaseModel):
    output_format: Literal["png", "pil", "array"] = Field(
        "png",
        description="Desired render output format",
        alias="outputFormat",
    )
    collect_layers: bool = Field(
        False,
        description="Return intermediate layers for parity diagnostics",
        alias="collectLayers",
    )
    diagnostics: bool = Field(
        True,
        description="Return per-layer timing + notes",
    )
    include_layer_images: bool = Field(
        False,
        description="Embed PNG data for each collected layer",
        alias="includeLayerImages",
    )

    model_config = ConfigDict(
        populate_by_name=True,
        extra="ignore",
    )


class RenderParams(BaseModel):
    spriteNumber: int
    params: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class RenderRequest(BaseModel):
    payload: RenderParams
    options: RenderOptions | None = None


class LayerDiagnostic(BaseModel):
    id: LayerIdentifier
    label: str
    duration_ms: float
    diagnostics: List[str] = Field(default_factory=list)
    blend_mode: Optional[str] = None
    image: Optional[str] = None


class RenderMeta(BaseModel):
    started_at: float
    finished_at: float
    duration_ms: float
    memory_pressure: bool


class RenderResponse(BaseModel):
    image: str
    meta: RenderMeta
    layers: Optional[List[LayerDiagnostic]] = None


class DiffRequest(BaseModel):
    v2: RenderParams
    v3: RenderParams
    epsilon: int = Field(0, ge=0, description="Allowed per-channel pixel difference")
    collect_layers: bool = False


class DiffLayerResult(BaseModel):
    id: LayerIdentifier
    mismatch_pixels: int
    total_pixels: int
    mismatch_ratio: float


class DiffResponse(BaseModel):
    composed: DiffLayerResult
    layers: List[DiffLayerResult]


class BatchVariant(BaseModel):
    id: str = Field(..., description="Unique identifier for the variant frame")
    label: Optional[str] = Field(
        default=None,
        description="Human-readable label for UI display",
    )
    group: Optional[str] = Field(
        default=None,
        description="Logical group identifier (e.g. accessories round)",
    )
    sprite_number: Optional[int] = Field(
        default=None,
        alias="spriteNumber",
        description="Override sprite number for this variant",
    )
    overrides: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Shallow overrides applied to the base payload params",
    )
    params: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Full parameter object for this variant; takes precedence over overrides",
    )

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BatchRenderOptions(BaseModel):
    tile_size: Optional[int] = Field(
        default=None,
        alias="tileSize",
        description="Output tile size in pixels. Defaults to renderer tile size (50).",
        ge=1,
    )
    columns: Optional[int] = Field(
        default=None,
        description="Desired column count when packing frames into the sheet.",
        ge=1,
    )
    include_sources: bool = Field(
        default=False,
        alias="includeSources",
        description="Return individual frame images alongside the spritesheet.",
    )
    include_base: bool = Field(
        default=True,
        alias="includeBase",
        description="Include the base payload render as the first frame.",
    )
    frame_mode: Literal["composed", "layer"] = Field(
        default="composed",
        alias="frameMode",
        description="Choose whether frames capture full composites or a single layer overlay.",
    )
    layer_id: Optional[LayerIdentifier | str] = Field(
        default=None,
        alias="layerId",
        description="When frameMode is 'layer', specify which layer identifier to extract.",
    )
    expand_variants: bool = Field(
        default=False,
        alias="expandVariants",
        description="When true and variants are omitted, the backend expands all known variants for the requested layer.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BatchRenderRequest(BaseModel):
    payload: RenderParams
    variants: List[BatchVariant] = Field(default_factory=list)
    options: Optional[BatchRenderOptions] = None


class SpritesheetFrame(BaseModel):
    id: str
    label: Optional[str] = None
    group: Optional[str] = None
    index: int
    column: int
    row: int
    x: int
    y: int
    width: int
    height: int


class FrameSource(BaseModel):
    id: str
    image: str


class BatchRenderResponse(BaseModel):
    sheet: str
    width: int
    height: int
    tileSize: int
    frames: List[SpritesheetFrame]
    sources: Optional[List[FrameSource]] = None
