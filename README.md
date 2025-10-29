# BeastyPage Production Notes

This project serves multiple front-end entry points (hub, gatcha, stream, collection, personal) from a single Next.js application. In production we run the app behind Pangolin with one PM2 process per entry so each port (and thus subdomain) lands on the right page immediately.

## Prerequisites

- **Node.js / Bun** – the front-end expects Bun for install/build/start (`bun install`, `bun run build`, `bun run start`).
- **PM2** – process manager used on the production host.
- **Git** – to clone/pull updates.

## One-Time Production Setup

1. Clone the repository onto the production machine:
   ```bash
   git clone https://github.com/BeastyTwitch/beastypage.git
   cd beastypage/frontend
   ```

2. Install dependencies and build the optimized bundle:
   ```bash
   bun install
   bun run build
   ```

3. (Optional) If you also serve the renderer service, install its dependencies (see `backend/renderer_service`).

4. After deploying Convex functions for the first time (and whenever they change), run:
   ```bash
   cd frontend
   npx convex deploy
   ```

## Running the Front-End with PM2

The Next.js app includes `middleware.ts` which reads two environment variables:

- `NEXT_ENTRY_REDIRECT` – route to open when the request hits `/` (e.g. `/gatcha`).
- `NEXT_ENTRY_HOST_MAP` – JSON map of `hostname -> route`. Useful if you prefer one PM2 process that handles all subdomains; otherwise keep it unset.

### Multi-Port Pattern (one PM2 process per entry)

Recommended port map:

| Page        | Route        | Port |
|-------------|--------------|------|
| Hub         | `/`          | 3000 |
| Gatcha      | `/gatcha`    | 3001 |
| Stream      | `/stream`    | 3002 |
| Collection  | `/collection`| 3003 |
| Personal    | `/personal`  | 3004 |

This is the most direct way to support Pangolin’s `port <-> subdomain` mapping. Duplicate the following command for every entry you need (hub, gatcha, stream, collection, personal):

```bash
# Example: hub on port 3000
PORT=3000 NEXT_ENTRY_REDIRECT=/ \
  pm2 start bun --name beastypage-hub \
  --interpreter none --cwd ./frontend -- run start

# Gatcha landing on port 3001
PORT=3001 NEXT_ENTRY_REDIRECT=/gatcha \
  pm2 start bun --name beastypage-gatcha \
  --interpreter none --cwd ./frontend -- run start

# Stream tools on port 3002
PORT=3002 NEXT_ENTRY_REDIRECT=/stream \
  pm2 start bun --name beastypage-stream \
  --interpreter none --cwd ./frontend -- run start

# Collection on port 3003
PORT=3003 NEXT_ENTRY_REDIRECT=/collection \
  pm2 start bun --name beastypage-collection \
  --interpreter none --cwd ./frontend -- run start

# Personal page on port 3004
PORT=3004 NEXT_ENTRY_REDIRECT=/personal \
  pm2 start bun --name beastypage-personal \
  --interpreter none --cwd ./frontend -- run start
```

If you’re using subdomains under `beastyrabbit.com`, you can copy these ready-to-run commands (replace the domain if needed):

```bash
PORT=3000 NEXT_ENTRY_REDIRECT=/ \
  NEXT_PUBLIC_HUB_URL=https://hub.beastyrabbit.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.beastyrabbit.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.beastyrabbit.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.beastyrabbit.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.beastyrabbit.com \
  pm2 start bun --name beastypage-hub --interpreter none --cwd ./frontend -- run start

PORT=3001 NEXT_ENTRY_REDIRECT=/gatcha \
  NEXT_PUBLIC_HUB_URL=https://hub.beastyrabbit.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.beastyrabbit.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.beastyrabbit.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.beastyrabbit.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.beastyrabbit.com \
  pm2 start bun --name beastypage-gatcha --interpreter none --cwd ./frontend -- run start

PORT=3002 NEXT_ENTRY_REDIRECT=/stream \
  NEXT_PUBLIC_HUB_URL=https://hub.beastyrabbit.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.beastyrabbit.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.beastyrabbit.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.beastyrabbit.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.beastyrabbit.com \
  pm2 start bun --name beastypage-stream --interpreter none --cwd ./frontend -- run start

PORT=3003 NEXT_ENTRY_REDIRECT=/collection \
  NEXT_PUBLIC_HUB_URL=https://hub.beastyrabbit.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.beastyrabbit.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.beastyrabbit.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.beastyrabbit.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.beastyrabbit.com \
  pm2 start bun --name beastypage-collection --interpreter none --cwd ./frontend -- run start

PORT=3004 NEXT_ENTRY_REDIRECT=/personal \
  NEXT_PUBLIC_HUB_URL=https://hub.beastyrabbit.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.beastyrabbit.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.beastyrabbit.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.beastyrabbit.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.beastyrabbit.com \
  pm2 start bun --name beastypage-personal --interpreter none --cwd ./frontend -- run start
```

Pair each port with the matching Caddy/Pangolin subdomain (e.g. `hub.example.com -> :3000`, `gatcha.example.com -> :3001`, and so on). The middleware ensures that requests for `/` on that port are redirected to the correct route.

After you start all processes, save and check their status:

```bash
pm2 save
pm2 status
```

### Using the Ecosystem File

The repository already includes `ecosystem.config.cjs` with five frontend entries (hub, gatcha, stream, collection, personal) plus the renderer service. To launch everything in one shot, run:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Each frontend entry sets its own `PORT` and `NEXT_ENTRY_REDIRECT`, so Pangolin can map subdomains directly to the exposed ports without extra flags. The renderer service (`beastypage-renderer`) is started alongside them; remove it from the ecosystem file if you host that component elsewhere.

### PM2 Startup (Reboot Persistence)

To have PM2 revive the processes after system restarts:

```bash
pm2 startup              # prints a command tailored to your distro
# copy & run the printed command with sudo
pm2 save                 # store the current process list
```

Whenever you change the PM2 lineup (add/remove apps), rerun `pm2 save` so the launch script stays current.

### Environment Variables for Cross-Linking

Navigation links can point directly at their live subdomains/ports when the following optional environment variables are defined at build/start time:

| Variable                     | Purpose                           | Default (if unset) |
|------------------------------|-----------------------------------|---------------------|
| `NEXT_PUBLIC_HUB_URL`        | Hub link + logo target            | `/`                 |
| `NEXT_PUBLIC_GATCHA_URL`     | Gatcha nav link                   | `/gatcha`           |
| `NEXT_PUBLIC_STREAM_URL`     | Stream tools nav link             | `/stream`           |
| `NEXT_PUBLIC_COLLECTION_URL` | Collection nav link               | `/collection`       |
| `NEXT_PUBLIC_PERSONAL_URL`   | Personal nav link                 | `/personal`         |

Set these on each PM2 process (or in your hosting provider) so cross-links jump straight to the correct subdomain. Example for the gatcha process:

```bash
PORT=3001 NEXT_ENTRY_REDIRECT=/gatcha NEXT_PUBLIC_HUB_URL=https://hub.example.com \
  NEXT_PUBLIC_GATCHA_URL=https://gatcha.example.com \
  NEXT_PUBLIC_STREAM_URL=https://stream.example.com \
  NEXT_PUBLIC_COLLECTION_URL=https://collection.example.com \
  NEXT_PUBLIC_PERSONAL_URL=https://personal.example.com \
  pm2 start bun --name beastypage-gatcha --interpreter none --cwd ./frontend -- run start
```

Only define the variables that differ from the defaults; any omitted value keeps the relative in-app link.

### Alternative: Single Process with Host Map

When running one process (e.g. behind a reverse proxy that handles all subdomains), set `NEXT_ENTRY_HOST_MAP` instead of multiple PM2 entries:

```bash
PORT=3000 NEXT_ENTRY_HOST_MAP='{
  "gatcha.example.com": "/gatcha",
  "stream.example.com": "/stream",
  "collection.example.com": "/collection",
  "personal.example.com": "/personal"
}' \
  pm2 start bun --name beastypage \
  --interpreter none --cwd ./frontend -- run start
```

Requests to `/` will redirect according to the hostname value that Pangolin forwards.

## Updating Production After Pulls

1. Use the helper script (`scripts/update-prod.sh`) to automate pull/install/build/reload. Copy it once to the parent directory (next to the `beastypage/` folder) and run it from there:
   ```bash
   cp scripts/update-prod.sh ../update-beastypage.sh
   chmod +x ../update-beastypage.sh
   ../update-beastypage.sh
   ```
   The script will:
   - `git fetch && git pull --ff-only`
   - `bun install` and `bun run build`
   - Reload running PM2 apps (or start them from `ecosystem.config.cjs` if missing)
   - Copy the latest version of itself back to `../update-beastypage.sh` after each run

2. If you prefer manual steps, run the commands above as separate operations and finish with `pm2 save`.

## Troubleshooting Tips

- If a subdomain keeps redirecting to the wrong page, confirm that the PM2 process covering that port exposes the correct `NEXT_ENTRY_REDIRECT`.
- Use `pm2 logs <name>` to view live output (helpful for catching missing environment variables).
- The middleware ignores non-root paths, so deep links (e.g. `/gatcha/cats/123`) still resolve normally.

Feel free to adapt these steps to match your hosting stack. The key pieces are the `NEXT_ENTRY_REDIRECT` (or `NEXT_ENTRY_HOST_MAP`) variables and ensuring each port/subdomain combination runs a dedicated PM2 process.
