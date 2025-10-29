from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .config import settings


class MissingSpriteAssets(RuntimeError):
    pass


def expect_sprites(path: Path | None = None, required: Iterable[str] | None = None) -> Path:
    """Validate that the sprite root exists and contains the expected atlas files."""

    sprite_root = Path(path) if path else settings.sprite_root
    if not sprite_root.exists():
        raise MissingSpriteAssets(f"Sprite root '{sprite_root}' is missing. Configure CG3_SPRITE_ROOT or add assets.")

    if required:
        missing = [name for name in required if not (sprite_root / name).exists()]
        if missing:
            raise MissingSpriteAssets(
                "Sprite root is missing required files: " + ", ".join(missing)
            )
    return sprite_root


__all__ = ["expect_sprites", "MissingSpriteAssets"]
