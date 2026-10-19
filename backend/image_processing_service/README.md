# Image processing service

The image processing service is the Pixelator Hono API. It runs pixel-art algorithms and grid detection in bounded worker threads. Requests carry base64 image data URLs. The worker validates dimensions, can downscale preview requests, normalizes the input to PNG for internal processing, executes the configured pipeline, and returns an encoded image data URL.

## Running locally

The service package provides the development command:

```sh
pnpm --dir backend/image_processing_service run dev
```

It watches `src/index.ts`, uses Node's strip-types loader, and listens on port 8002 by default. The root `pnpm dev` stack does not start this service. The container definition is [Dockerfile](Dockerfile); it exposes port 8002 and starts `node --experimental-strip-types src/index.ts`.

The API exposes `GET /health`, `GET /openapi.json`, `POST /process`, and `POST /detect-grid`.

## Environment and limits

`src/config.ts` reads these variables:

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `MAX_IMAGE_SIZE` | Input image byte limit, clamped to 1 through 10,485,760 bytes |
| `MAX_PIXELS` | Decoded pixel limit, clamped to 1 through 4,000,000 pixels |
| `WORKERS` | Concurrent disposable worker threads, clamped to 1 through 2 |
| `MAX_DIMENSION` | Maximum input width or height |
| `PREVIEW_MAX_DIMENSION` | Longest side used when preview mode downsizes an image |
| `REQUEST_TIMEOUT` | Worker request timeout in milliseconds |

The defaults are 10,485,760 input bytes, 4,000,000 decoded pixels, two workers, an 8,000-pixel dimension limit, a 1,200-pixel preview dimension, and a 30-second timeout. Each worker has a 256 MiB old-generation heap limit. Pipeline work is capped at 32,000,000 weighted pixels, and a pipeline contains at most 20 steps.

## Checks

```sh
pnpm image-processing:check
pnpm --dir backend/image_processing_service run typecheck
pnpm --dir backend/image_processing_service run test
```

The service runs TypeScript directly with Node's strip-only loader. See [Runtime TypeScript services](../../docs/runtime-typescript.md) for the syntax constraints.
