# Renderer Service (CatGenerator V3 backend)

FastAPI service that reproduces the Lifegen sprite renderer for CatGenerator V3. It loads atlases copied from the
upstream game (`backend/renderer_service/sprites`) and exposes an API for rendering and inspecting layer diagnostics.

## Project layout

```
backend/renderer_service/
├── pyproject.toml      # uv project metadata (uv is the Python package manager)
├── README.md
├── renderer_service/
│   ├── __init__.py
│   ├── assets.py       # sprite root discovery utilities
│   ├── config.py       # pydantic-settings backed configuration
│   ├── models.py       # request/response contracts
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py     # FastAPI application factory & routes
│   └── renderer/
│       ├── __init__.py
│       ├── repository.py   # atlas loader + caching
│       ├── stages.py       # one class per render stage
│       └── pipeline.py     # orchestrates stages and blending
├── sprites/                # bundled Lifegen atlases (PNG)
├── renderer_service/data/  # spritesIndex.json + spritesOffsetMap.json
└── tests/
```

## Implemented pipeline

The backend currently reproduces the full V2 render order:

1. Base coat (pattern + tint + reverse)
2. White patches
3. Points overlays
4. Vitiligo overlays
5. Eyes / heterochromia overlays
6. Shading (multiply) + lighting
7. Dark Forest tint (multiply)
8. Lineart (regular, dead, DF handled in `repository.lineart`)
9. Skin tones
10. Scars (additive and missing variants)
11. Accessories (collars, plant/wild atlases)

Every stage records diagnostics and (optionally) returns intermediate canvases when `collectLayers=true`.

## Running locally

```sh
cd backend/renderer_service
uv sync                                   # install dependencies once
uv run uvicorn renderer_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

* The service defaults to the bundled `sprites/` directory. Override with `CG3_SPRITE_ROOT=/path/to/sprites`.
* `/health` returns a liveness probe. `/render` accepts JSON payloads mirroring the V2 generator parameters.

### During frontend development

The Next.js app proxies to the renderer via Bun:

```sh
cd frontend
bun run backend:test-server   # starts uvicorn on the configured port (8001 by default)
bun run dev                   # launches Next.js + renderer concurrently
```

Vitest spins the renderer automatically when `bun run test` is executed (set `CG3_SKIP_RENDERER_BOOT=1` to reuse an
already running instance).

## Testing

```sh
# Backend unit tests
uv run --directory backend/renderer_service pytest

# Frontend parity smoke test (requires Bun)
cd frontend
bun run test
```

## Deployment

Run the API directly with `uv` / `uvicorn`:

```sh
uv run uvicorn renderer_service.app.main:app --host 0.0.0.0 --port 8001
```

Adjust the host/port or process supervisor configuration to match your production environment.

## TODO / Next steps

- Tune Dark Forest tint to match the original palette export.
- Expand accessory lookup for small-animal / insect atlases and seasonal packs.
- Integrate the renderer diff harness (V2 vs V3) into CI for regression detection.
- Add caching/batching for repeated renders when the API is exercised in bulk.
