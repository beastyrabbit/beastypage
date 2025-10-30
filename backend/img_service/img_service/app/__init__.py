from __future__ import annotations

import base64
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl

from ..config import settings
from ..thumbs import ThumbnailResult, create_thumbnail


class ThumbnailFromUrlRequest(BaseModel):
  source_url: HttpUrl = Field(..., description="Publicly reachable image URL")
  max_dimension: int = Field(default_factory=lambda: settings.default_max_dimension, ge=8, le=4096)
  quality: int = Field(default_factory=lambda: settings.thumbnail_quality, ge=1, le=100)
  filename: str | None = Field(default=None, description="Optional filename hint for diagnostics")


class ThumbnailResponse(BaseModel):
  image_data_url: str
  width: int
  height: int
  original_width: int
  original_height: int
  content_type: str
  filename: str


async def _download_image(url: str) -> bytes:
  timeout = settings.fetch_timeout
  async with httpx.AsyncClient(timeout=timeout) as client:
    response = await client.get(url)
    if response.status_code >= 400:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unable to fetch source image (status {response.status_code})",
      )
    return response.content


def _serialize_result(result: ThumbnailResult) -> ThumbnailResponse:
  encoded = base64.b64encode(result.data).decode("ascii")
  data_url = f"data:{result.content_type};base64,{encoded}"
  return ThumbnailResponse(
    image_data_url=data_url,
    width=result.thumbnail_size[0],
    height=result.thumbnail_size[1],
    original_width=result.original_size[0],
    original_height=result.original_size[1],
    content_type=result.content_type,
    filename=result.filename,
  )


def create_app() -> FastAPI:
  app = FastAPI(title="Image Utility Service", version="0.1.0")

  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
  )

  @app.get("/health", response_model=dict[str, Any])
  def health() -> dict[str, Any]:
    return {
      "status": "ok",
      "defaults": {
        "max_dimension": settings.default_max_dimension,
        "timeout": settings.fetch_timeout,
        "quality": settings.thumbnail_quality,
      },
    }

  @app.post("/thumbnail/url", response_model=ThumbnailResponse)
  async def thumbnail_from_url(request: ThumbnailFromUrlRequest) -> ThumbnailResponse:
    payload = await _download_image(str(request.source_url))
    try:
      result = create_thumbnail(
        payload,
        max_dimension=request.max_dimension,
        quality=request.quality,
        filename=request.filename or "thumbnail.webp",
      )
    except Exception as exc:  # noqa: BLE001
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Failed to generate thumbnail: {exc}",
      ) from exc
    return _serialize_result(result)

  return app


__all__ = ["create_app"]
