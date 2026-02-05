from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional, TypeVar

import anyio
from fastapi import FastAPI, HTTPException, status
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

T = TypeVar("T")


class QueueOverloadedError(RuntimeError):
    """Raised when the render queue is full."""


class CircuitOpenError(RuntimeError):
    """Raised when the circuit breaker is open."""


@dataclass
class QueueJob:
    execute: Callable[[], T]
    future: asyncio.Future
    kind: Literal["single", "batch"]
    enqueued_at: float


class RendererSupervisor:
    def __init__(
        self,
        pipeline: RenderPipeline,
        *,
        max_queue_size: int = 120,
        worker_count: int = 4,
        circuit_failure_threshold: int = 10,
        circuit_reset_seconds: int = 10,
    ) -> None:
        self.pipeline = pipeline
        self.queue: asyncio.Queue[QueueJob] = asyncio.Queue(maxsize=max_queue_size)
        self.worker_count = worker_count
        self._workers: list[asyncio.Task] = []
        self._circuit_failure_threshold = circuit_failure_threshold
        self._circuit_reset_seconds = circuit_reset_seconds

        self.total_enqueued = 0
        self.total_completed = 0
        self.total_failed = 0
        self.circuit_open_until = 0.0
        self.consecutive_failures = 0
        self.max_observed_queue = 0
        self.logger = logging.getLogger("renderer.queue")

    async def start(self) -> None:
        for _ in range(self.worker_count):
            task = asyncio.create_task(self._worker(), name="renderer-worker")
            self._workers.append(task)

    async def stop(self) -> None:
        for task in self._workers:
            task.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()

    def _ensure_circuit(self) -> None:
        now = time.monotonic()
        if self.circuit_open_until and now < self.circuit_open_until:
            self.logger.warning(
                "rejecting request while circuit open (resets in %.2fs)",
                self.circuit_open_until - now,
            )
            raise CircuitOpenError("Renderer circuit is open due to recent failures.")

    def _record_success(self) -> None:
        self.total_completed += 1
        self.consecutive_failures = 0
        if self.circuit_open_until and time.monotonic() >= self.circuit_open_until:
            self.circuit_open_until = 0.0

    def _record_failure(self) -> None:
        self.total_failed += 1
        self.consecutive_failures += 1
        if self.consecutive_failures >= self._circuit_failure_threshold:
            self.circuit_open_until = time.monotonic() + self._circuit_reset_seconds
            self.logger.error(
                "renderer circuit opening for %.2fs after %d consecutive failures",
                self._circuit_reset_seconds,
                self.consecutive_failures,
            )
        else:
            self.logger.warning(
                "renderer failure recorded (%d consecutive, %d total)",
                self.consecutive_failures,
                self.total_failed,
            )

    async def submit(self, kind: Literal["single", "batch"], fn: Callable[[], T]) -> T:
        self._ensure_circuit()
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        job = QueueJob(
            execute=fn, future=future, kind=kind, enqueued_at=time.monotonic()
        )
        try:
            self.queue.put_nowait(job)
        except asyncio.QueueFull as exc:
            self.logger.warning("renderer queue at capacity (%d)", self.queue.maxsize)
            raise QueueOverloadedError from exc

        self.total_enqueued += 1
        self.max_observed_queue = max(self.max_observed_queue, self.queue.qsize())

        try:
            return await future
        except asyncio.CancelledError:
            raise

    async def _worker(self) -> None:
        while True:
            job = await self.queue.get()
            try:
                result = await anyio.to_thread.run_sync(job.execute, cancellable=True)
            except Exception as exc:  # noqa: BLE001
                if not job.future.done():
                    job.future.set_exception(exc)
                self._record_failure()
            else:
                if not job.future.done():
                    job.future.set_result(result)
                self._record_success()
            finally:
                self.queue.task_done()

    def metrics(self) -> dict[str, Any]:
        now = time.monotonic()
        return {
            "queue_size": self.queue.qsize(),
            "max_queue": self.queue.maxsize,
            "max_observed_queue": self.max_observed_queue,
            "total_enqueued": self.total_enqueued,
            "total_completed": self.total_completed,
            "total_failed": self.total_failed,
            "circuit_open": bool(
                self.circuit_open_until and now < self.circuit_open_until
            ),
            "circuit_reset_in": max(0.0, self.circuit_open_until - now)
            if self.circuit_open_until
            else 0.0,
            "worker_count": self.worker_count,
        }


def create_app() -> FastAPI:
    app = FastAPI(
        title="Cat Generator V3 Renderer",
        version="1.3.3",
        description=(
            "Composites ClanGen pixel-art sprites into cat card images. "
            "Supports single renders, batch spritesheets, palette listing, "
            "and V2-vs-V3 visual diffs."
        ),
        servers=[
            {"url": "http://localhost:8001", "description": "Local dev"},
            {"url": "/api/renderer", "description": "Frontend proxy"},
        ],
        openapi_tags=[
            {"name": "rendering", "description": "Single and batch cat sprite rendering"},
            {"name": "palettes", "description": "Color palette discovery"},
            {"name": "diagnostics", "description": "Health and operational metrics"},
        ],
    )
    pipeline = RenderPipeline(canvas_size=settings.default_canvas_size)
    supervisor = RendererSupervisor(
        pipeline,
        max_queue_size=settings.max_queue_size
        if hasattr(settings, "max_queue_size")
        else 120,
        worker_count=settings.worker_count if hasattr(settings, "worker_count") else 4,
        circuit_failure_threshold=settings.circuit_failure_threshold
        if hasattr(settings, "circuit_failure_threshold")
        else 8,
        circuit_reset_seconds=settings.circuit_reset_seconds
        if hasattr(settings, "circuit_reset_seconds")
        else 12,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def _startup() -> None:
        await supervisor.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        await supervisor.stop()

    @app.get("/health", tags=["diagnostics"], summary="Service health check")
    def health() -> dict[str, Any]:
        metrics = supervisor.metrics()
        status_label = "degraded" if metrics["circuit_open"] else "ok"
        return {"status": status_label, "metrics": metrics}

    @app.post("/render", response_model=RenderResponse, tags=["rendering"], summary="Render a single cat sprite")
    async def render(request: RenderRequest) -> RenderResponse:
        try:
            return await supervisor.submit(
                "single",
                lambda: _render_single(pipeline, request),
            )
        except QueueOverloadedError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Renderer queue is full. Please retry shortly.",
            ) from None
        except CircuitOpenError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Renderer recovering from failures. Please retry.",
            ) from None

    @app.post("/render/batch", response_model=BatchRenderResponse, tags=["rendering"], summary="Render a batch spritesheet")
    async def render_batch(request: BatchRenderRequest) -> BatchRenderResponse:
        try:
            return await supervisor.submit(
                "batch",
                lambda: _render_batch(pipeline, request),
            )
        except QueueOverloadedError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Renderer queue is full. Please retry shortly.",
            ) from None
        except CircuitOpenError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Renderer recovering from failures. Please retry.",
            ) from None

    @app.post("/diff", response_model=DiffResponse, tags=["rendering"], summary="V2 vs V3 visual diff (not yet implemented)")
    def diff(_: DiffRequest) -> DiffResponse:  # pragma: no cover - placeholder
        raise NotImplementedError("V2 vs V3 diffing is not implemented yet")

    @app.get("/palettes", tags=["palettes"], summary="List available color palettes")
    def get_palettes() -> list[dict]:
        """Return all available color palettes with their metadata and colors."""
        return pipeline.mapper.get_palette_metadata()

    return app


def _render_single(pipeline: RenderPipeline, request: RenderRequest) -> RenderResponse:
    payload = request.payload
    params = {**payload.params}
    params.setdefault("spriteNumber", payload.spriteNumber)
    collect_layers = request.options.collect_layers if request.options else False
    include_layer_images = (
        request.options.include_layer_images if request.options else False
    )

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
                "image": _image_to_data_url(layer.image)
                if include_layer_images
                else None,
            }
            for layer in result.layers
        ]
        if collect_layers
        else None,
    )


def _render_batch(
    pipeline: RenderPipeline, request: BatchRenderRequest
) -> BatchRenderResponse:
    base_params = {**request.payload.params}
    base_params.setdefault("spriteNumber", request.payload.spriteNumber)

    options = request.options
    frame_mode = options.frame_mode if options else "composed"
    layer_identifier: Optional[LayerIdentifier] = None
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
        sources = [
            FrameSource(id=frame_id, image=_image_to_data_url(image))
            for frame_id, image in batch_result.sources
        ]

    return BatchRenderResponse(
        sheet=sheet_data,
        width=batch_result.sheet.width,
        height=batch_result.sheet.height,
        tileSize=batch_result.tile_size,
        frames=frames,
        sources=sources,
    )


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
