"""CatGenerator V3 renderer service package."""

from .monitoring import init_monitoring

init_monitoring()

from .config import settings  # noqa: E402

__all__ = ["settings"]
