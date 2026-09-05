# Renderer Service (CatGenerator V3 backend)

FastAPI service that reproduces the Lifegen sprite renderer for CatGenerator V3. It loads the canonical atlases from `frontend/public/sprites` in a checkout and exposes an API for rendering and inspecting layer diagnostics.

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
│       ├── v3_renderer.py  # compositor stages and blending
│       └── pipeline.py     # API response and batch wrapper
├── sprites/                # bundled Lifegen atlases (PNG)
├── renderer_service/data/  # spritesIndex.json + spritesOffsetMap.json
└── tests/
```

## Implemented pipeline

The backend renderer composes cats in this order:

1. Base pelt and tortie layers
2. Derived coat pattern, with tortie layers recomposed above it
3. Tint
4. White patches
5. Points overlays
6. Vitiligo overlays
7. Eyes and heterochromia overlays
8. Primary scars
9. Shading (multiply)
10. Lighting
11. Dark Forest tint (multiply)
12. Lineart (regular, dead, or Dark Forest)
13. Skin tones
14. Missing-part scars
15. Accessories (collars, plant, and wild atlases)

Horizontal reversal is applied after composition so every recorded stage and
the final canvas stay aligned.

Every stage records diagnostics and (optionally) returns intermediate canvases when `collectLayers=true`.

## Running locally

```sh
cd backend/renderer_service
uv sync                                   # install dependencies once
uv run uvicorn renderer_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

* Sprite discovery prefers `frontend/public/sprites`, then the bundled `sprites/` directory. Override with `CG3_SPRITE_ROOT`. Sprite and atlas caches are in memory. There is no render-result or disk cache.
* `/health` returns a liveness probe plus queue metrics (`queue_size`, `circuit_open`, etc.). `/render` accepts Cat Generator V3 JSON payloads.

### Runtime observability

The renderer throttles work using a bounded queue and a small worker pool. Key environment variables (`CG3_*`) you can tune:

| Variable | Default | Description |
|----------|---------|-------------|
| `CG3_MAX_QUEUE_SIZE` | `120` | Maximum number of enqueued render jobs before new requests receive HTTP 503. |
| `CG3_WORKER_COUNT` | `4` | Number of background workers servicing the queue. |
| `CG3_CIRCUIT_FAILURE_THRESHOLD` | `8` | Consecutive failures before the circuit breaker trips. |
| `CG3_CIRCUIT_RESET_SECONDS` | `12` | Cooldown window before the circuit closes automatically. |

Probe `/health` (or expose it through your reverse proxy) to let your process supervisor or load balancer watch the queue:

```sh
curl -s http://localhost:8001/health | jq
```

When the queue approaches capacity or the circuit opens, FastAPI logs (`renderer.queue` logger) emit warnings that surface in your container/process logs.

### During frontend development

Use `pnpm dev` from the repository root for the configured full stack, or run the renderer separately with `pnpm dev:renderer`.
`pnpm --dir frontend dev` starts only Next.js. See the [root setup guide](../../README.md).

## Testing

```sh
uv run --project backend/renderer_service --frozen --extra dev pytest backend/renderer_service/tests
pnpm --dir frontend exec vitest run --project renderer
```

The frontend integration project owns an ephemeral-port renderer and verifies its catalog and manifest hashes. Unit tests do not start Python. No shared listener or lock file is reused.

## Request limits and options

Batches accept at most 256 total frames, tiles up to 1024 pixels, and a 16 million pixel working budget including sheet padding, source copies, and layer extraction. Validation runs before queue admission.
Only PNG HTTP output is supported. `collectLayers` returns layers, `includeLayerImages` embeds their PNGs, and `diagnostics=false` suppresses per-layer notes and timing. Batch `params` merge over the base, then `overrides` win. Omitted values retain the base; empty lists and false explicitly clear traits.
`expandVariants=true` is rejected. Callers must send explicit variants.

## Deployment

Run the API directly with `uv` / `uvicorn`:

```sh
uv run uvicorn renderer_service.app.main:app --host 0.0.0.0 --port 8001
```

Adjust the host/port or process supervisor configuration to match your production environment.

### Quick load test recipe

Use [k6](https://k6.io/) (or a similar tool such as `hey`) to validate queue behaviour before pushing to production:

```sh
# k6 example (10 s ramp up to 40 virtual users)
k6 run scripts/render-load-test.js
```

Create `scripts/render-load-test.js` with a minimal payload:

```js
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 40 },
    { duration: '20s', target: 40 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const payload = JSON.stringify({
    payload: { spriteNumber: 8, params: { colour: 'WHITE', peltName: 'SingleColour' } },
    options: { collectLayers: false },
  });
  http.post('http://localhost:8001/render', payload, { headers: { 'Content-Type': 'application/json' } });
  sleep(0.2);
}
```

Monitor `/health` while the test runs to tune queue/worker settings and confirm the circuit breaker only trips once saturation is sustained.

## TODO / Next steps

- Tune Dark Forest tint to match the original palette export.
- Expand accessory lookup for small-animal / insect atlases and seasonal packs.
- Add caching/batching for repeated renders when the API is exercised in bulk.
