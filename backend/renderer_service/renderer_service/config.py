from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_sprite_root() -> Path:
    config_path = Path(__file__).resolve()
    for parent in config_path.parents:
        candidate = parent / "frontend" / "public" / "sprites"
        if candidate.exists():
            return candidate
    fallback_parent = config_path.parents[1] if len(config_path.parents) > 1 else config_path.parent
    return fallback_parent / "sprites"


class Settings(BaseSettings):
    """Runtime configuration for the renderer service."""

    sprite_root: Path = Field(
        default_factory=lambda: _default_sprite_root(),
        description="Filesystem path to the Lifegen sprite directory"
    )
    cache_dir: Path = Field(
        default_factory=lambda: Path(os.getenv("XDG_CACHE_HOME", Path.home() / ".cache")) / "cat-renderer",
        description="Directory used for hashed render caches (PNG)"
    )
    default_canvas_size: int = Field(50, ge=32, le=200)
    enable_cache: bool = Field(True)
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ],
        description="Origins allowed by CORS middleware",
    )

    model_config = SettingsConfigDict(env_prefix="CG3_", env_file=".env", env_file_encoding="utf-8")

    @field_validator("sprite_root", mode="before")
    def _expand_sprite_root(cls, value: Optional[str | Path]) -> Path:
        if value is None:
            return Path(__file__).resolve().parents[1] / "sprites"
        if isinstance(value, Path):
            return value
        return Path(os.path.expanduser(value)).resolve()

    @field_validator("cache_dir", mode="before")
    def _expand_cache_dir(cls, value: Optional[str | Path]) -> Path:
        if value is None:
            cache = Path(os.getenv("XDG_CACHE_HOME", Path.home() / ".cache")) / "cat-renderer"
            cache.mkdir(parents=True, exist_ok=True)
            return cache
        if isinstance(value, Path):
            value.mkdir(parents=True, exist_ok=True)
            return value
        path = Path(os.path.expanduser(value)).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = ["Settings", "settings", "get_settings"]
