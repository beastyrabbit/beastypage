# Renderer service

FastAPI service that reproduces the Lifegen sprite renderer for CatGenerator V3. It loads canonical atlases and sprite metadata, then exposes endpoints for rendering cats and inspecting layer diagnostics.

## Project layout

```
backend/renderer_service/
├── .dockerignore                         # Files excluded from the Docker build context
├── CHANGELOG.md                           # Renderer release history
├── Dockerfile                             # Two-stage image build with the canonical sprite assets
├── README.md                              # This document
├── lifegen/                               # Vendored Lifegen package
│   ├── __init__.py                        # Vendored Lifegen package marker
│   └── scripts.py                         # Imports lifegen_fullgen.scripts for package setup
├── lifegen_bootstrap.py                   # Initializes pygame and Lifegen sprite/data environment variables
├── package.json                            # Local renderer start scripts
├── pyproject.toml                          # uv project metadata and Python dependencies
├── pytest.ini                              # pytest test-path configuration
├── renderer_service/
│   ├── __init__.py                         # CatGenerator V3 renderer service package exports
│   ├── app/
│   │   ├── __init__.py                     # FastAPI factory, queue supervisor, middleware, and routes
│   │   └── main.py                         # ASGI application export
│   ├── assets.py                            # Sprite-root validation helper
│   ├── config.py                            # Pydantic settings and CG3_ environment configuration
│   ├── data/                                # Local renderer data root and palette directory
│   │   └── palettes/                        # Experimental colour palette JSON files
│   ├── game.py                              # Minimal Lifegen game settings and generation configuration
│   ├── generated/
│   │   ├── bundle-integrity.json            # Generated asset and artifact digest manifest
│   │   ├── cat-document.schema.json         # Generated cat document JSON Schema
│   │   ├── catalog-hash.txt                 # Generated catalog hash
│   │   ├── compatibility.json               # Generated legacy trait compatibility manifest
│   │   ├── public-cat-catalog.json          # Generated public catalog
│   │   ├── render-plan.json                 # Generated ordered render operations and catalog
│   │   └── render-strategies.manifest.json  # Generated render-strategy versions and schemas
│   ├── models.py                            # Pydantic request, response, and render-budget models
│   ├── render_contract.py                   # Generated render-strategy manifest checker
│   ├── renderer/
│   │   ├── __init__.py                      # Lazy renderer pipeline export
│   │   ├── coat_patterns.py                 # Pose-aware coat markings from source pelt sprites
│   │   ├── colors.py                         # Lifegen colour-name to RGBA mappings
│   │   ├── contracts.py                      # Render-plan and cat-document contract models
│   │   ├── document_schema.py                # Validator for the generated cat document schema
│   │   ├── executor.py                       # Render-plan loading, validation, and execution
│   │   ├── image_ops.py                      # RGBA, blend, mask, tint, and transparency operations
│   │   ├── integrity.py                      # Generated bundle and asset integrity checks
│   │   ├── legacy_adapter.py                 # Legacy parameter to cat-document compatibility adapter
│   │   ├── patterns.py                       # Textile pattern tile generation and caching
│   │   ├── pipeline.py                       # API response and batch-render wrapper
│   │   ├── repository.py                     # Lifegen atlas loader and in-memory sprite caches
│   │   ├── sprite_mapper.py                  # Cat-generation parameter to atlas-sprite mapping
│   │   ├── strategies.py                     # Render strategy implementations and registry setup
│   │   ├── strategy_registry.py               # Versioned render strategy registry and execution context
│   │   └── v3_renderer.py                    # CatGenerator V3 composition stages
│   └── resources.py                          # JSON file loader
├── sprites/                                  # Fallback Lifegen sprite atlases
├── tests/
│   ├── fixtures/
│   │   └── reference_cat.json                # Reference cat render request
│   ├── test_accessory_mapping.py             # Accessory atlas mapping tests
│   ├── test_coat_patterns.py                 # Coat-pattern and validation tests
│   ├── test_render_contract.py               # Generated contract and API contract tests
│   ├── test_render_smoke.py                  # Renderer and endpoint smoke tests
│   ├── test_review_regressions.py            # Request-limit and review regression tests
│   ├── test_sonar_complexity_regressions.py  # Renderer complexity regression tests
│   └── test_workflow_gates.py                # Publication workflow dependency tests
└── uv.lock                                   # Locked Python dependency versions
```

The renderer prefers `frontend/public/sprites` and `frontend/public/sprite-data` in a checkout. It falls back to the service's `sprites/` and `renderer_service/data/` paths. The generated files under `renderer_service/generated/` are loaded when the service verifies and executes the render plan.

Pattern tiles and atlas data use in-memory caches. The service does not cache completed render results.

## Implemented pipeline

The generated render plan and `v3_renderer.py` compose cats in this order:

1. Base pelt and tortie layers
2. Derived coat pattern, with tortie layers recomposed above it
3. Tint
4. White patches
5. Points overlays
6. Vitiligo overlays
7. Eyes and heterochromia overlays
8. Primary scars
9. Shading with multiply blending
10. Lighting
11. Dark Forest tint with multiply blending
12. Lineart, using regular, dead, or Dark Forest sprites
13. Skin tones
14. Missing-part scars
15. Accessories from the generated catalog
16. Horizontal reversal when `reverse` is enabled

Each operation can record diagnostics and an intermediate image when `collectLayers=true`.

## Running locally

From the repository root, use the configured Portless command:

```sh
pnpm dev:renderer
```

This command runs `.venv/bin/python -m uvicorn renderer_service.app.main:app` with reload enabled, exposes the application on port 8001, and registers it as `renderer.beastypage` through Portless. The Portless URL is printed by the command.

For a direct service run:

```sh
cd backend/renderer_service
uv sync
uv run uvicorn renderer_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

The service reads these `CG3_` settings from `.env` or the environment:

| Variable | Meaning |
| --- | --- |
| `CG3_SPRITE_ROOT` | Sprite atlas directory override |
| `CG3_DATA_ROOT` | Canonical sprite metadata directory override |
| `CG3_DEFAULT_CANVAS_SIZE` | Render canvas size, between 32 and 200 pixels |
| `CG3_MAX_QUEUE_SIZE` | Maximum queued render jobs |
| `CG3_WORKER_COUNT` | Number of render workers |
| `CG3_CIRCUIT_FAILURE_THRESHOLD` | Consecutive failures required to open the circuit |
| `CG3_CIRCUIT_RESET_SECONDS` | Circuit reset interval |
| `CG3_ALLOWED_ORIGINS` | Comma-separated CORS origins |

`CAT_SYSTEM_CATALOG_HASH` optionally checks the generated catalog hash during application startup. The health endpoint is `GET /health`; rendering uses `POST /render` and `POST /render/batch`, and palette metadata uses `GET /palettes`.

```sh
curl -s http://localhost:8001/health | jq
```

The request body limit is 2 MiB. Batch requests allow at most 256 frames and a 16 million pixel working budget. Batch tile sizes are limited to 1024 pixels. `expandVariants=true` is rejected because callers must send explicit variants.

## Testing

```sh
uv run --project backend/renderer_service --frozen --extra dev pytest backend/renderer_service/tests
uv run --project backend/renderer_service python -m renderer_service.render_contract --check
pnpm --dir frontend exec vitest run --project renderer
```

The renderer container listens on port 8001. Its Dockerfile copies the canonical frontend sprite atlases and sprite-data JSON files into the image and starts `uvicorn renderer_service.app.main:app`.
