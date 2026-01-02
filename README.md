# BeastyPage

A Next.js application serving multiple entry points (hub, gatcha, stream, collection, personal) with a Python-based renderer service.

## Architecture

- **Frontend**: Next.js 16 with React 19, deployed as a standalone Docker container
- **Renderer Service**: FastAPI/Python service for cat card generation
- **Database**: Convex (serverless)
- **Deployment**: Kubernetes via FluxCD

## Container Images

Images are automatically built and pushed to GHCR on pushes to `main`:

- `ghcr.io/beastyrabbit/beastypage-frontend:latest`
- `ghcr.io/beastyrabbit/beastypage-renderer:latest`

## Local Development

### Frontend

```bash
cd frontend
bun install
bun run dev
```

### Renderer Service

```bash
cd backend/renderer_service
uv pip install --editable .
uv run uvicorn renderer_service.app.main:app --reload --port 8001
```

## Environment Variables

### Build-time (Frontend)

Set as GitHub repository secrets for CI/CD:

| Variable | Description |
|----------|-------------|
| `CONVEX_DEPLOYMENT` | Convex deployment identifier |
| `NEXT_PUBLIC_CONVEX_URL` | Convex cloud URL |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key (optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL (optional) |

### Runtime

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `RENDERER_INTERNAL_URL` | Renderer service URL | - |

## Kubernetes Deployment

Deployment manifests are managed in the [kub-homelab](https://github.com/beastyrabbit/kub-homelab) repository under `cluster/homelab/apps/webpage/beastypage/`.

## Project Structure

```
beastypage/
├── frontend/               # Next.js application
│   ├── convex/             # Convex functions and schema
│   ├── app/                # Next.js app router pages
│   └── Dockerfile          # Multi-stage build (Bun → Node)
├── backend/
│   ├── renderer_service/   # FastAPI cat renderer
│   │   └── Dockerfile      # Python/uv build
│   └── README.md
└── .github/workflows/      # CI/CD pipelines
```
