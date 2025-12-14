# Cat Gacha Frontend

## PM2 / LXC Quick Start

These are the PM2 commands we run on the LXC host (adjust `/opt/beastypage` to your path).

```bash
cd /opt/beastypage

# install dependencies (first run / after changes)
mkdir -p frontend/.bun-tmp
BUN_TMPDIR=$(pwd)/frontend/.bun-tmp bun install

# build production bundle
bun run build

# PM2 script for combined frontend + renderer
cat <<'EOF' > pm2-start.sh
#!/usr/bin/env bash
cd /opt/beastypage
exec bun run start
EOF
chmod +x pm2-start.sh
pm2 start ./pm2-start.sh --name beastypage

# optional: standalone renderer worker
cat <<'EOF' > pm2-renderer.sh
#!/usr/bin/env bash
cd /opt/beastypage
exec bun run dev:renderer
EOF
chmod +x pm2-renderer.sh
pm2 start ./pm2-renderer.sh --name beastypage-renderer

pm2 save
```

**Deploy workflow**

```bash
cd /opt/beastypage
git pull
BUN_TMPDIR=$(pwd)/frontend/.bun-tmp bun install
bun run build
pm2 reload beastypage
pm2 reload beastypage-renderer   # if running separately
```

Logs: `pm2 logs beastypage` (and `pm2 logs beastypage-renderer`).


Next.js app that powers the Catdex, history tools, and collection gallery. The project ships with a self-hosted Convex backend and an importer so fresh deployments can boot with production-quality data.

## Prerequisites

- [Bun](https://bun.sh/) 1.1+
- [Convex CLI](https://docs.convex.dev/quickstart) (the repo uses `bunx convex …` in the examples below)
- Node.js 20+ for local tooling (already covered by Bun images when using Docker)

## Local Setup

```bash
cd frontend
bun install
bun run prepare   # runs `convex codegen`
```

In one terminal start the Convex dev server:

```bash
bun run convex:dev
```

In another terminal start the web+renderer stack:

```bash
bun run dev
```

The site runs at http://localhost:3000, the renderer service at http://localhost:8001, and Convex at http://localhost:3210.

## Seeding Convex with Catdex + Collection Data

Use the Python helper to stream the export bundle straight into Convex storage
and tables—no temporary API routes or shared disk mounts required:

```bash
python scripts/import_catdex.py \
  --export-dir backend/catdex-export-20251022-142634 \
  --host http://192.168.50.233:3210
```

The script prompts for the Convex admin key (or accept `--admin-key=<value>`),
uploads every referenced image, and calls `importer:ingestBundle` to populate the
`catdex`, `collection`, `rarity`, and `card_season` tables. It aborts if those
tables already contain data, so clear them first when re-importing.

## Key Scripts

| Command | Description |
| ------- | ----------- |
| `bun run dev` | Next.js app + renderer service (via `concurrently`). |
| `bun run convex:dev` | Runs Convex dev server locally. |
| `bun run lint` | ESLint with Next.js config. |
| `bun run build` | Production build (Next.js + Convex bundling). |

## Production Deployment

The frontend now deploys without Docker. Typical flow (bare metal, VM, or LXC):

1. Copy the repository to the target host and install Bun 1.1+.
2. Provide configuration via `.env.local` (or environment variables). At minimum set:

   ```bash
   CONVEX_SELF_HOSTED_URL=http://convex:3210
   CONVEX_SELF_HOSTED_ADMIN_KEY=...
   NEXT_PUBLIC_CONVEX_URL=https://convex.your-domain.example
   ```

   Adjust values to match your Convex deployment.

3. Install dependencies and build:

   ```bash
   bun install --production
   bun run build
   ```

4. Start the service (e.g. under systemd or another supervisor):

   ```bash
   bun run start
   ```

Convex and the renderer can continue to run on the same host or separate machines; just ensure the URLs referenced in `.env.local` resolve from the frontend environment.

## Progressive Media Loading

- `frontend/components/common/ProgressiveImage.tsx` streams a blurred thumbnail first, then swaps to the full asset once downloaded.
- Catdex cards use the export’s `thumbs_*.png` files; Collection cards use `blur_img` / `preview_img` / `full_img` tiers.

## Folder Overview

- `app/catdex` — Catdex browser with filters, progressive image loading, and detail drawer.
- `app/collection` — Gallery with blurred-placeholder previews and modal viewer.
- `app/guided-builder` — React port of the guided builder wizard powered by the V3 renderer.
- `app/guided-builder/view/[[...slug]]` — Timeline viewer that replays each builder step from a shared link.
- `components/guided-builder/` — Client components for the wizard (state machine, option pickers, timeline viewer).
- `scripts/import_catdex.py` — CLI importer that uploads the export bundle into Convex.
- `frontend/convex/importer.ts` — Convex action + mutation used by the importer script.
- `convex/rarities.ts` / `convex/seasons.ts` — Helpers used by the importer mutation to guarantee defaults.
- `backend/catdex-export-*/` — Raw export bundles (JSON + images) checked into the repo for deterministic seeding.

## Troubleshooting

- The importer refuses to run if `catdex` or `collection` already contain data.
  Use the Convex dashboard/CLI to delete rows before re-running the script.
- Install [Pillow](https://python-pillow.org/) to record image width/height
  metadata automatically; without it those fields are left `null`.
- `scripts/build-catdex-payload.mjs` can regenerate `catdex-payload.json` from a
  raw PocketBase export if you need to rebuild the archive.
- Set `NEXT_PUBLIC_CONVEX_PORT` in
  `.env.local` so the frontend points at the correct host.
