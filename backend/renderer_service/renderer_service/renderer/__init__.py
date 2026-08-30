"""Renderer pipeline exports without eager import cycles."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .pipeline import RenderPipeline


def __getattr__(name: str):
    if name == "RenderPipeline":
        from .pipeline import RenderPipeline

        return RenderPipeline
    raise AttributeError(name)


__all__ = ["RenderPipeline"]
