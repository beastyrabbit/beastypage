from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
  allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
  fetch_timeout: float = 10.0
  default_max_dimension: int = 256
  thumbnail_quality: int = 85

  @field_validator("allowed_origins", mode="before")
  @classmethod
  def _coerce_origins(cls, value: str | list[str]) -> list[str]:
    if isinstance(value, str):
      return [part.strip() for part in value.split(",") if part.strip()]
    return value

  class Config:
    env_prefix = "IMG_SERVICE_"


settings = Settings()

__all__ = ["settings"]
