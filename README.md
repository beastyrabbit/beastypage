# BeastyPage

A pixel cat gacha platform featuring generators, wheels, and collection tools built with ClanGen sprites.

## Features

- **Cat Generator** - Generate random pixel cats with customizable traits, accessories, and tortie coats
- **Gacha Wheel** - Weighted wheel spins with animated reveals
- **Catdex** - Browse and search all generated cats in a Pokedex-style archive
- **Adoption Generator** - Roll whole litters, trim each round, finish with your favorites
- **Visual Builder** - Trait-by-trait sprite previews with instant updates
- **Stream Tools** - Live session controls for audience voting and shareable builds

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS
- **Backend**: Convex (serverless database), FastAPI renderer service
- **Package Manager**: Bun
- **Deployment**: Kubernetes via FluxCD, Docker containers

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Convex](https://convex.dev) account (for database)
- Python 3.11+ with [uv](https://github.com/astral-sh/uv) (for renderer service)

### Frontend

```bash
cd frontend
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Renderer Service (Optional)

The renderer service generates cat card images. If not running, the frontend will work but card generation will be unavailable.

```bash
cd backend/renderer_service
uv pip install --editable .
uv run uvicorn renderer_service.app.main:app --reload --port 8001
```

## Environment Variables

### Build-time (Frontend)

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
├── lifegen-fullgen/        # LifeGen sprite generation library
└── .github/workflows/      # CI/CD pipelines
```

## Container Images

Images are automatically built and pushed to GHCR on pushes to `main`:

- `ghcr.io/beastyrabbit/beastypage-frontend:latest`
- `ghcr.io/beastyrabbit/beastypage-renderer:latest`

### Running with Your Own Database

The frontend image uses a placeholder for the Convex URL at build time. Provide your own Convex instance at runtime:

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud \
  ghcr.io/beastyrabbit/beastypage-frontend:latest
```

### Kubernetes Deployment

For Kubernetes/Talos deployments, configure the Convex URL via ConfigMap or Secret:

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: frontend
          image: ghcr.io/beastyrabbit/beastypage-frontend:latest
          env:
            - name: NEXT_PUBLIC_CONVEX_URL
              valueFrom:
                secretKeyRef:
                  name: beastypage-secrets
                  key: convex-url
```

## Credits

### ClanGen Sprites

Cat sprites originate from [ClanGen](https://github.com/ClanGenOfficial/clangen), licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

- Original creator: just-some-cat.tumblr.com
- Fan-edit creator: SableSteel and others

### LifeGen

Built with components from [LifeGen](https://mods.clangen.io/LifeGen/download), a ClanGen mod.

### Pixel Cat Maker

Additional tooling from [Pixel Cat Maker](https://github.com/cgen-tools/pixel-cat-maker).

## License

- **Code**: [MPL-2.0](LICENSE.md) (Mozilla Public License 2.0)
- **Sprites/Art**: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (NonCommercial)

See [LICENSE.md](LICENSE.md) for full details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
