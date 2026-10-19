# BeastyPage


## At a glance

A pixel-cat gacha site with generators, animated wheels, adoption tools, and a searchable Catdex.

## Features

- **Cat Generator** - Generate random pixel cats with customizable traits, accessories, tortie coats, and 20 derived coat patterns across gacha, builders, adoption, evolution, ancestry, streams, and Discord
- **Gacha Wheel** - Weighted wheel spins with animated reveals
- **Catdex** - Browse and search all generated cats in a Pokedex-style archive
- **Adoption Generator** - Roll whole litters, trim each round, finish with your favorites
- **Visual Builder** - Trait-by-trait sprite previews with instant updates
- **Stream Tools** - Live session controls for audience voting and shareable builds

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS
- **Backend**: PostgreSQL with Drizzle migrations, FastAPI renderer service
- **Package Manager**: pnpm
- **Deployment**: Kubernetes via FluxCD, Docker containers

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v24+; required by Portless)
- [pnpm](https://pnpm.io/) (v10+)
- Access to the development PostgreSQL configuration in Infisical
- Python 3.11+ with [uv](https://github.com/astral-sh/uv) (for renderer service)
- [Infisical CLI](https://infisical.com/docs/cli/overview) with access to the development project

### Full development environment

```bash
pnpm install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile --ignore-scripts
pnpm --dir backend/media_service install --frozen-lockfile
npm --prefix backend/discord-bot ci
pnpm --dir backend/image_processing_service install --frozen-lockfile
(cd backend/renderer_service && uv sync --frozen --extra dev)
pnpm dev
```

`pnpm dev` checks the generated cat-system contract and required secrets, starts
the frontend, renderer, media service, Discord bot, and palette watcher, then
opens the worktree-specific Portless URL after every service is ready. The exact
URL is printed in the terminal; it is intentionally not hard-coded.

The frontend uses PostgreSQL through the Drizzle data layer. The production CNPG
cluster is `beastypage-postgres` in the `webpage` namespace; migrations run in
the frontend init container before the application starts. The default full
development setup gets database and runtime values from Infisical paths
`/kubernetes/webpage/beastypage-postgres` and
`/kubernetes/webpage/beastypage-frontend-runtime-config`.

### Frontend only

```bash
pnpm --dir frontend run db:local up
pnpm --dir frontend run db:migrate
pnpm --dir frontend dev
```

Before the final command, copy the `DATABASE_URL` line from the gitignored
`frontend/.env.database.local` into `frontend/.env.local` because Next.js does
not load the helper's filename. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` there for signed-in flows. The root `pnpm dev:frontend` script
is the Infisical-backed alternative and injects the database and runtime
configuration for you.

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
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key (optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL (optional) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |

### Quick Share worker

| Variable | Description |
|----------|-------------|
| `QUICK_SHARE_WORKER_URL` | Public base URL used to dispatch Quick Share jobs (for example, `https://beastyrabbit.com`) |

Quick Share background processing is event driven. See the
[Quick Share processing rollout and production runbook](docs/quick-share-processing-rollout.md)
for the architecture, cost model, rollout lessons, and verification procedure.

### Runtime

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `RENDERER_INTERNAL_URL` | Renderer service URL | - |
| `IMAGE_PROCESSING_INTERNAL_URL` | Image processing service URL | - |
| `MEDIA_SERVICE_INTERNAL_URL` | Media service URL | - |

## Project Structure

```
beastypage/
├── frontend/               # Next.js application
│   ├── app/                # Next.js routes and PostgreSQL-backed API
│   └── Dockerfile          # Multi-stage build (pnpm → Node)
├── backend/
│   ├── discord-bot/        # Discord commands and cat generation
│   ├── image_processing_service/
│   ├── media_service/      # Quick Share media worker
│   └── renderer_service/   # FastAPI cat renderer
├── deploy/                 # PostgreSQL CNPG and Infisical sync templates
├── docs/                   # Development, operations, migration and rollout docs
├── scripts/                 # Sprite import tooling
└── .github/workflows/      # build-images.yml, validate.yml, sonarqube.yml
```

Each backend service directory has its own README with run commands and environment variables.

Additional operational notes:

- [Stream overlay architecture and timing](docs/stream-overlays.md)
- [Local development notes](docs/local-development.md)
- [PostgreSQL operations](docs/migration/operations.md)
- [PostgreSQL architecture decision record](docs/migration/adr-0001-postgresql.md)
- [PostgreSQL migration record](docs/migration/status.md)
- [Runtime TypeScript constraints](docs/runtime-typescript.md)
- [Release verification](docs/release-verification.md)

## Container Images

GitHub Actions builds and publishes GHCR images from `.github/workflows/build-images.yml`. Version-tag pushes such as `v8.1.0` receive `X.Y.Z` and `X.Y` semver tags, main pushes receive `latest` and a commit SHA tag, and manual runs can receive a smoke tag. Publication jobs require their applicable validation checks to succeed. Pull requests run validation only.

The published image names are:

- `ghcr.io/beastyrabbit/beastypage-frontend`
- `ghcr.io/beastyrabbit/beastypage-renderer`
- `ghcr.io/beastyrabbit/beastypage-image-processing`
- `ghcr.io/beastyrabbit/beastypage-media`
- `ghcr.io/beastyrabbit/beastypage-discord-bot`

### Cat-system release cutover

Frontend, renderer, and Discord images from one release carry the same generated
cat-catalog hash. Their image builds fail when the supplied hash does not match
the bundled contract, and runtime consumers fail closed when a renderer reports
a different hash.

A release that changes this hash must therefore use a coordinated big-bang
cutover, not an ordinary mixed-version rolling deployment: build every consumer
from one tag, verify the new frontend and renderer stacks report the same hash,
then switch traffic to both together. Keep the previous stack available for
rollback until external smoke tests pass. Never suppress a catalog mismatch to
make a rollout green; that can return a valid response containing the wrong
pixels. The one-time `v7.3.1` to `v7.4.0` transition is compatible because the
legacy renderer does not advertise a catalog hash.

### Running with Your Own Database

The frontend image connects to the PostgreSQL-backed API configured by its runtime environment:

```bash
docker run --rm \
  -v /absolute/path/to/ca.crt:/etc/postgres-ca/ca.crt:ro \
  -e NODE_ENV=production \
  -e DATABASE_MIGRATION_URL='postgresql://owner:owner_password@db.example.com:5432/beastypage?sslmode=verify-full&sslrootcert=/etc/postgres-ca/ca.crt' \
  -e DATABASE_APP_ROLE=beastypage_app \
  ghcr.io/beastyrabbit/beastypage-frontend:8.1.0 \
  node scripts/db/migrate.mjs

docker run --rm -p 3000:3000 \
  -v /absolute/path/to/ca.crt:/etc/postgres-ca/ca.crt:ro \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgresql://app:app_password@db.example.com:5432/beastypage?sslmode=verify-full&sslrootcert=/etc/postgres-ca/ca.crt' \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_replace_me \
  -e CLERK_SECRET_KEY=sk_live_replace_me \
  ghcr.io/beastyrabbit/beastypage-frontend:8.1.0
```

The first command applies the schema with the owner URL before the app starts;
the second uses the app URL for serving requests. For a throwaway local setup,
`DATABASE_ALLOW_INSECURE=1` is the documented override for a non-verified
connection.

### Kubernetes Deployment

For Kubernetes/Talos deployments, configure the PostgreSQL runtime values via the
frontend runtime Secret and the CNPG cluster Secret:

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: frontend
          image: ghcr.io/beastyrabbit/beastypage-frontend:8.1.0
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: beastypage-frontend-runtime-config
                  key: DATABASE_URL
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
