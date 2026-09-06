from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_sprite_root() -> Path:
    config_path = Path(__file__).resolve()
    for parent in config_path.parents:
        candidate = parent / "frontend" / "public" / "sprites"
        if candidate.exists():
            return candidate
    fallback_parent = (
        config_path.parents[1] if len(config_path.parents) > 1 else config_path.parent
    )
    return fallback_parent / "sprites"


def _default_data_root() -> Path:
    config_path = Path(__file__).resolve()
    for parent in config_path.parents:
        candidate = parent / "frontend" / "public" / "sprite-data"
        if candidate.exists():
            return candidate
    return config_path.parent / "data"


class Settings(BaseSettings):
    """Runtime configuration for the renderer service."""

    sprite_root: Path = Field(
        default_factory=lambda: _default_sprite_root(),
        description="Filesystem path to the Lifegen sprite directory",
    )
    data_root: Path = Field(
        default_factory=lambda: _default_data_root(),
        description="Filesystem path to canonical sprite metadata",
    )
    default_canvas_size: int = Field(50, ge=32, le=200)
    max_queue_size: int = Field(120, ge=10, le=1000)
    worker_count: int = Field(4, ge=1, le=32)
    circuit_failure_threshold: int = Field(8, ge=3, le=50)
    circuit_reset_seconds: int = Field(12, ge=3, le=120)
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ],
        description="Origins allowed by CORS middleware",
    )

    model_config = SettingsConfigDict(
        env_prefix="CG3_", env_file=".env", env_file_encoding="utf-8"
    )

    @field_validator("sprite_root", mode="before")
    def _expand_sprite_root(cls, value: str | Path | None) -> Path:
        if value is None:
            return Path(__file__).resolve().parents[1] / "sprites"
        if isinstance(value, Path):
            return value
        return Path(os.path.expanduser(value)).resolve()

    @field_validator("data_root", mode="before")
    def _expand_data_root(cls, value: str | Path | None) -> Path:
        if value is None:
            return _default_data_root()
        if isinstance(value, Path):
            return value
        return Path(os.path.expanduser(value)).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = ["Settings", "get_settings", "settings"]
