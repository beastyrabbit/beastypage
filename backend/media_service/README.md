# Media service

The Quick Share media worker is a Hono service for uploads and remote imports. It validates media, creates normalized image or video derivatives, stores objects in an S3-compatible bucket, and calls the control plane for job state.

## Running locally

From the repository root:

```sh
pnpm dev:media
```

The root command injects the development `/media` environment, runs the service with Node's strip-types loader, and puts the app port 8003 behind Portless as `media.beastypage`. The Portless URL is printed by the command. The service health endpoint is `GET /health`.

The container definition is [Dockerfile](Dockerfile). From this directory it installs production dependencies, adds `ffmpeg` and `tini`, exposes port 8003, and starts `node --experimental-strip-types src/index.ts`.

## Environment

`src/config.ts` validates these variables. The required names are `CONTROL_PLANE_URL`, `QUICK_SHARE_INTERNAL_TOKEN`, `QUICK_SHARE_HMAC_KEY`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Other names have defaults in the schema. Secret values belong in the runtime secret store.

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port |
| `PUBLIC_BASE_URL` | Base URL used for public Quick Share links |
| `CONTROL_PLANE_URL` | Frontend control-plane endpoint for job operations |
| `QUICK_SHARE_INTERNAL_TOKEN` | Token for authenticated control-plane and worker calls |
| `QUICK_SHARE_HMAC_KEY` | Key for upload, IP, grant, and preview signatures |
| `S3_ENDPOINT` | S3-compatible object-store endpoint |
| `S3_REGION` | S3 region sent to the client |
| `S3_BUCKET` | Bucket for uploaded objects and derivatives |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `TRUSTED_PROXY_CIDRS` | Comma-separated proxy networks trusted for client IP headers |
| `WORKER_ENABLED` | Enables the event-driven media worker |
| `TEMP_DIR` | Directory for temporary imports and processing files |
| `PROCESSING_TIMEOUT_MS` | Per-job processing timeout |

The dispatch design is documented in [Quick Share processing rollout](../../docs/quick-share-processing-rollout.md). Workers receive a job ID through an authenticated callback, use a short lease, and rely on bounded retries and an infrequent recovery sweep.

## Checks

```sh
pnpm media:check
pnpm --dir backend/media_service run lint
pnpm --dir backend/media_service run typecheck
pnpm --dir backend/media_service run test
```

The media service runs TypeScript directly with Node's strip-only loader. See [Runtime TypeScript services](../../docs/runtime-typescript.md) before adding TypeScript syntax that requires a transform.
