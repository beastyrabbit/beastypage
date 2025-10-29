from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import settings
from ..models import (
    DiffResponse,
    DiffRequest,
    RenderRequest,
    RenderResponse,
    BatchRenderRequest,
    BatchRenderResponse,
    SpritesheetFrame,
    FrameSource,
    LayerIdentifier,
)
from ..renderer import RenderPipeline


def create_app() -> FastAPI:
    app = FastAPI(title="Cat Generator V3 Renderer", version="0.1.0")
    pipeline = RenderPipeline(canvas_size=settings.default_canvas_size)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/render", response_model=RenderResponse)
    def render(request: RenderRequest) -> RenderResponse:
        payload = request.payload
        params = {**payload.params}
        params.setdefault("spriteNumber", payload.spriteNumber)
        collect_layers = request.options.collect_layers if request.options else False
        include_layer_images = request.options.include_layer_images if request.options else False

        result = pipeline.render(params, collect_layers=collect_layers)
        image_bytes = _image_to_data_url(result.composed)
        return RenderResponse(
            image=image_bytes,
            meta=result.meta,
            layers=[
                {
                    "id": layer.id,
                    "label": layer.label,
                    "duration_ms": layer.duration_ms,
                    "diagnostics": layer.diagnostics,
                    "blend_mode": layer.blend_mode,
                    "image": _image_to_data_url(layer.image) if include_layer_images else None,
                }
                for layer in result.layers
            ]
            if collect_layers
            else None,
        )

    @app.post("/render/batch", response_model=BatchRenderResponse)
    def render_batch(request: BatchRenderRequest) -> BatchRenderResponse:
        base_params = {**request.payload.params}
        base_params.setdefault("spriteNumber", request.payload.spriteNumber)

        options = request.options
        frame_mode = options.frame_mode if options else "composed"
        layer_identifier = None
        if options and options.layer_id is not None:
            layer_identifier = _coerce_layer_identifier(options.layer_id)

        batch_result = pipeline.render_batch(
            base_params,
            request.variants,
            include_base=options.include_base if options else True,
            tile_size=options.tile_size if options else None,
            columns=options.columns if options else None,
            include_sources=options.include_sources if options else False,
            frame_mode=frame_mode,
            layer_identifier=layer_identifier,
        )

        sheet_data = _image_to_data_url(batch_result.sheet)
        frames = [
            SpritesheetFrame(
                id=frame.id,
                label=frame.label,
                group=frame.group,
                index=frame.index,
                column=frame.column,
                row=frame.row,
                x=frame.x,
                y=frame.y,
                width=frame.width,
                height=frame.height,
            )
            for frame in batch_result.frames
        ]

        sources = None
        if batch_result.sources:
            sources = [FrameSource(id=frame_id, image=_image_to_data_url(image)) for frame_id, image in batch_result.sources]

        return BatchRenderResponse(
            sheet=sheet_data,
            width=batch_result.sheet.width,
            height=batch_result.sheet.height,
            tileSize=batch_result.tile_size,
            frames=frames,
            sources=sources,
        )

    @app.post("/diff", response_model=DiffResponse)
    def diff(_: DiffRequest) -> DiffResponse:  # pragma: no cover - placeholder
        raise NotImplementedError("V2 vs V3 diffing is not implemented yet")

    return app


def _image_to_data_url(image) -> str:
    import base64
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _coerce_layer_identifier(layer: LayerIdentifier | str) -> LayerIdentifier:
    if isinstance(layer, LayerIdentifier):
        return layer
    try:
        return LayerIdentifier(layer)
    except ValueError as exc:
        raise ValueError(f"Unknown layer identifier '{layer}'") from exc
