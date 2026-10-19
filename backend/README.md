# Backend services

Use the [root setup guide](../README.md) for the development stack and delivery policy.

| Directory | Responsibility |
| --- | --- |
| [renderer_service](renderer_service/README.md) | FastAPI cat renderer, generated contract, and sprite composition. |
| image_processing_service | Pixelator processing and grid detection in bounded workers. |
| [media_service](media_service/README.md) | Quick Share imports, validation, S3 storage, and event-driven processing. |
| [discord-bot](discord-bot/README.md) | Discord commands and authenticated frontend API calls. |

The frontend API uses PostgreSQL through Drizzle. Production runs the
`beastypage-postgres` CNPG cluster in the `webpage` namespace, with migrations
applied by the frontend init container. Database credentials are managed in
Infisical at `/kubernetes/webpage/beastypage-postgres`; frontend runtime values
are managed at `/kubernetes/webpage/beastypage-frontend-runtime-config`.
The renderer prefers `frontend/public/sprites` and `frontend/public/sprite-data` in a checkout.
Its container copies those same canonical assets. `CG3_SPRITE_ROOT` and `CG3_DATA_ROOT` override discovery.

From the repository root:

```bash
uv sync --project backend/renderer_service --frozen --extra dev
uv run --project backend/renderer_service --extra dev pytest backend/renderer_service/tests
pnpm media:check
pnpm image-processing:check
```

The GitHub Actions container workflow publishes images only after its applicable validation job succeeds. Production deployment requires separate approval.
