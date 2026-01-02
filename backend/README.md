# Backend Monorepo

This directory now hosts all backend-facing infrastructure for the BeastyRabbit tools stack.

## Layout

- `renderer_service/` – FastAPI + uv powered CatGenerator V3 renderer. The service is self-contained
  (sprite atlases live under `renderer_service/sprites`) and is packaged for deployment via Docker/uvicorn.

> **Note:** Image transformations (Catdex thumbnails) are now handled by `sharp` directly in Convex.

## Renderer service

```bash
cd backend/renderer_service
uv pip install --editable .[dev]  # one-off to fetch dev tooling
uv run uvicorn renderer_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

The service automatically loads sprites from `renderer_service/sprites`. Override with `CG3_SPRITE_ROOT` if you need to
point at a different asset set.

### Tests

```bash
uv run --directory backend/renderer_service pytest
```

### Docker

A `Dockerfile` lives beside the project root. GitHub Actions builds and publishes `ghcr.io/<org>/<repo>/renderer-service` on
pushes that touch the backend renderer.
