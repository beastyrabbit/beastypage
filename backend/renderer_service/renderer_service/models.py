from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from .renderer.contracts import CatDocument

# These values bound both the work performed by the generated document validator
# and the amount of user supplied data that can be copied for each batch frame.
# They are deliberately generous for a cat document, while keeping a malicious
# nested value from multiplying into hundreds of megabytes in ``render_batch``.
MAX_JSON_DEPTH = 32
MAX_JSON_NODES = 20_000
MAX_JSON_BYTES = 256 * 1024
MAX_BATCH_JSON_NODES = 80_000
MAX_BATCH_JSON_BYTES = 1 * 1024 * 1024


@dataclass(frozen=True)
class JsonBudget:
    bytes: int = 0
    nodes: int = 0
    depth: int = 0

    def __add__(self, other: JsonBudget) -> JsonBudget:
        return JsonBudget(
            bytes=self.bytes + other.bytes,
            nodes=self.nodes + other.nodes,
            depth=max(self.depth, other.depth),
        )


def _json_node_size(value: JsonValue) -> tuple[int, Iterable[JsonValue]]:
    if value is None:
        return 4, ()
    if isinstance(value, bool):
        return (5 if value else 4), ()
    if isinstance(value, int):
        # ``repr`` is intentionally avoided: Python can reject conversion of a
        # very large integer after its parser has already materialized it.
        return max(1, abs(value).bit_length() + 2), ()
    if isinstance(value, float):
        return len(repr(value)), ()
    if isinstance(value, str):
        # JSON escaping can expand a character to six ASCII bytes. This is a
        # conservative upper bound and avoids allocating another large copy.
        return 2 + len(value) * 6, ()
    if isinstance(value, list):
        return 2 + max(0, len(value) - 1), value
    if isinstance(value, dict):
        key_bytes = sum(2 + len(str(key)) * 6 for key in value)
        return 2 + max(0, len(value) - 1) + key_bytes, value.values()
    raise ValueError("contains a non-JSON value")  # pragma: no cover


def _json_value_budget(value: JsonValue, *, field: str) -> JsonBudget:
    """Measure JSON input without recursively walking attacker controlled data."""

    total_bytes = 0
    total_nodes = 0
    max_depth = 0
    pending: list[tuple[JsonValue, int]] = [(value, 0)]

    while pending:
        current, depth = pending.pop()
        total_nodes += 1
        max_depth = max(max_depth, depth)
        if total_nodes > MAX_JSON_NODES:
            raise ValueError(
                f"{field} contains too many JSON values (maximum {MAX_JSON_NODES})"
            )
        if depth > MAX_JSON_DEPTH:
            raise ValueError(
                f"{field} is nested too deeply (maximum depth {MAX_JSON_DEPTH})"
            )

        try:
            node_bytes, children = _json_node_size(current)
        except ValueError as exc:  # pragma: no cover - JsonValue excludes this
            raise ValueError(f"{field} {exc}") from exc
        total_bytes += node_bytes
        pending.extend((entry, depth + 1) for entry in children)

        if total_bytes > MAX_JSON_BYTES:
            raise ValueError(
                f"{field} is too large (maximum {MAX_JSON_BYTES} estimated bytes)"
            )

    return JsonBudget(total_bytes, total_nodes, max_depth)


def _document_json_budget(document: CatDocument) -> JsonBudget:
    return _json_value_budget(
        {
            "schemaVersion": document.schema_version,
            "traits": document.traits,
            "unknownTraits": document.unknown_traits,
        },
        field="payload.document",
    )


def _validate_render_input_budget(
    *,
    params: dict[str, JsonValue],
    document: CatDocument | None,
    field: str = "payload",
) -> JsonBudget:
    usage = _json_value_budget(params, field=f"{field}.params")
    if document is not None:
        usage += _document_json_budget(document)
    if usage.bytes > MAX_JSON_BYTES:
        raise ValueError(
            f"{field} is too large (maximum {MAX_JSON_BYTES} estimated bytes)"
        )
    if usage.nodes > MAX_JSON_NODES:
        raise ValueError(
            f"{field} contains too many JSON values (maximum {MAX_JSON_NODES})"
        )
    return usage


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
    output_format: Literal["png"] = Field(
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
    spriteNumber: int | None = Field(default=None, ge=0, le=100_000)
    poseName: str | None = Field(default=None, max_length=128)
    document: CatDocument | None = None
    params: dict[str, JsonValue] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_input_budget(self) -> RenderParams:
        _validate_render_input_budget(
            params=self.params,
            document=self.document,
        )
        return self


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
    id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Unique identifier for the variant frame",
    )
    label: str | None = Field(
        default=None,
        max_length=256,
        description="Human-readable label for UI display",
    )
    group: str | None = Field(
        default=None,
        max_length=256,
        description="Logical group identifier (e.g. accessories round)",
    )
    sprite_number: int | None = Field(
        default=None,
        alias="spriteNumber",
        ge=0,
        le=100_000,
        description="Override sprite number for this variant",
    )
    pose_name: str | None = Field(
        default=None,
        alias="poseName",
        max_length=128,
        description="Override named pose for this variant",
    )
    overrides: dict[str, JsonValue] | None = Field(
        default=None,
        description="Shallow overrides applied to the base payload params",
    )
    params: dict[str, JsonValue] | None = Field(
        default=None,
        description="Parameters merged over the base; overrides are applied last",
    )

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="after")
    def validate_input_budget(self) -> BatchVariant:
        for name, value in (("params", self.params), ("overrides", self.overrides)):
            if value is not None:
                _json_value_budget(value, field=f"variant.{name}")
        return self


class BatchRenderOptions(BaseModel):
    tile_size: int | None = Field(
        default=None,
        alias="tileSize",
        description="Output tile size in pixels. Defaults to renderer tile size (50).",
        ge=1,
        le=1024,
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
        max_length=128,
        description="When frameMode is 'layer', specify which layer identifier to extract.",
    )
    expand_variants: Literal[False] = Field(
        default=False,
        alias="expandVariants",
        description="Deprecated. Supply explicit variants; automatic expansion is unsupported.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BatchRenderRequest(BaseModel):
    payload: RenderParams
    variants: list[BatchVariant] = Field(default_factory=list, max_length=256)
    options: BatchRenderOptions | None = None

    @model_validator(mode="after")
    def validate_budget(self):
        options = self.options or BatchRenderOptions()
        frames = len(self.variants) + int(options.include_base)
        if not 1 <= frames <= 256:
            raise ValueError("Batch must contain between 1 and 256 frames")
        tile = options.tile_size or 200  # Upper bound for configured canvas size.
        columns = min(options.columns or max(1, int(frames**0.5 + 0.999)), frames)
        rows = (frames + columns - 1) // columns
        pixels = columns * rows * tile * tile
        pixels += frames * 200 * 200 * (2 if options.include_sources else 1)
        if options.frame_mode == "layer":
            pixels += frames * 200 * 200
        if pixels > 16_000_000:
            raise ValueError("Batch exceeds the 16 million pixel working budget")

        usage = _validate_render_input_budget(
            params=self.payload.params,
            document=self.payload.document,
            field="payload",
        )
        for variant in self.variants:
            for name, value in (
                ("params", variant.params),
                ("overrides", variant.overrides),
            ):
                if value is not None:
                    usage += _json_value_budget(value, field=f"variant.{name}")
            if usage.bytes > MAX_BATCH_JSON_BYTES:
                raise ValueError(
                    "Batch input JSON exceeds the "
                    f"{MAX_BATCH_JSON_BYTES}-byte working budget"
                )
            if usage.nodes > MAX_BATCH_JSON_NODES:
                raise ValueError(
                    "Batch input JSON exceeds the "
                    f"{MAX_BATCH_JSON_NODES}-value working budget"
                )
        return self


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
