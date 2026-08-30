from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from .renderer.contracts import CatDocument


class LayerIdentifier(str, Enum):
    base = "base"
    coat_pattern = "coatPattern"
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
        description="Return intermediate layers for renderer diagnostics",
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
    spriteNumber: int | None = None
    poseName: str | None = None
    document: CatDocument | None = None
    params: dict[str, JsonValue] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class RenderRequest(BaseModel):
    payload: RenderParams
    options: RenderOptions | None = None


class LayerDiagnostic(BaseModel):
    id: str
    operation_id: str | None = Field(default=None, alias="operationId")
    label: str
    duration_ms: float
    diagnostics: list[str] = Field(default_factory=list)
    blend_mode: str | None = None
    image: str | None = None


class RenderMeta(BaseModel):
    started_at: float
    finished_at: float
    duration_ms: float
    memory_pressure: bool
    catalog_hash: str | None = Field(default=None, alias="catalogHash")
    manifest_hash: str | None = Field(default=None, alias="manifestHash")
    render_plan_version: int | None = Field(default=None, alias="renderPlanVersion")

    model_config = ConfigDict(populate_by_name=True)


class RenderResponse(BaseModel):
    image: str
    meta: RenderMeta
    layers: list[LayerDiagnostic] | None = None


class BatchVariant(BaseModel):
    id: str = Field(..., description="Unique identifier for the variant frame")
    label: str | None = Field(
        default=None,
        description="Human-readable label for UI display",
    )
    group: str | None = Field(
        default=None,
        description="Logical group identifier (e.g. accessories round)",
    )
    sprite_number: int | None = Field(
        default=None,
        alias="spriteNumber",
        description="Override sprite number for this variant",
    )
    pose_name: str | None = Field(
        default=None,
        alias="poseName",
        description="Override named pose for this variant",
    )
    overrides: dict[str, JsonValue] | None = Field(
        default=None,
        description="Shallow overrides applied to the base payload params",
    )
    params: dict[str, JsonValue] | None = Field(
        default=None,
        description="Full parameter object for this variant; takes precedence over overrides",
    )

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BatchRenderOptions(BaseModel):
    tile_size: int | None = Field(
        default=None,
        alias="tileSize",
        description="Output tile size in pixels. Defaults to renderer tile size (50).",
        ge=1,
    )
    columns: int | None = Field(
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
    layer_id: str | None = Field(
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
    variants: list[BatchVariant] = Field(default_factory=list)
    options: BatchRenderOptions | None = None


class SpritesheetFrame(BaseModel):
    id: str
    label: str | None = None
    group: str | None = None
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
    catalog_hash: str = Field(alias="catalogHash")
    manifest_hash: str = Field(alias="manifestHash")
    render_plan_version: int = Field(alias="renderPlanVersion")
    frames: list[SpritesheetFrame]
    sources: list[FrameSource] | None = None

    model_config = ConfigDict(populate_by_name=True)
