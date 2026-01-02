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
* `/health` returns a liveness probe plus queue metrics (`queue_size`, `circuit_open`, etc.). `/render` accepts JSON payloads mirroring the V2 generator parameters.

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
- Integrate the renderer diff harness (V2 vs V3) into CI for regression detection.
- Add caching/batching for repeated renders when the API is exercised in bulk.
