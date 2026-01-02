# syntax=docker/dockerfile:1.6

# Stage 1: Build with uv
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies (create virtual environment)
RUN uv sync --frozen --no-dev

# Copy application code
COPY renderer_service ./renderer_service

# Copy sprites (required for rendering)
COPY sprites ./sprites

# Stage 2: Production image
FROM python:3.11-slim-bookworm AS runner
WORKDIR /app

# Install OS dependencies for pygame and pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsdl2-2.0-0 \
    libsdl2-image-2.0-0 \
    libsdl2-mixer-2.0-0 \
    libsdl2-ttf-2.0-0 \
    libjpeg62-turbo \
    libpng16-16 \
    zlib1g \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Copy virtual environment and application from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/renderer_service ./renderer_service
COPY --from=builder /app/sprites ./sprites

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Set environment
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV CG3_SPRITE_ROOT=/app/sprites

EXPOSE 8001

CMD ["uvicorn", "renderer_service.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
