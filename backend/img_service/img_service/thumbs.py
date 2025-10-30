from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Tuple

from PIL import Image, ImageOps


@dataclass(slots=True)
class ThumbnailResult:
  data: bytes
  thumbnail_size: Tuple[int, int]
  original_size: Tuple[int, int]
  content_type: str
  filename: str


def create_thumbnail(
  payload: bytes,
  *,
  max_dimension: int,
  quality: int = 85,
  filename: str = "thumbnail.webp",
) -> ThumbnailResult:
  with Image.open(io.BytesIO(payload)) as image:
    original_size = image.size
    converted = image.convert("RGBA")
    # Ensure we maintain aspect ratio and clamp to desired bounds.
    resized = ImageOps.contain(converted, (max_dimension, max_dimension), method=Image.Resampling.LANCZOS)
    thumb_size = resized.size

    buffer = io.BytesIO()
    resized.save(buffer, format="WEBP", quality=quality, method=6)
    resized.close()
    data = buffer.getvalue()

  return ThumbnailResult(
    data=data,
    thumbnail_size=thumb_size,
    original_size=original_size,
    content_type="image/webp",
    filename=filename.removesuffix(".webp") + ".webp",
  )
