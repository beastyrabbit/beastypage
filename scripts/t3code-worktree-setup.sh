#!/usr/bin/env bash
# Worktree setup — copies env files, installs all dependencies, and gives the
# worktree its own PostgreSQL database.
#
# Usage:
#   From T3 Code: the "Initialize worktree" action in t3.json, once imported
#                 into T3's project settings, runs this on worktree creation
#                 with T3CODE_PROJECT_ROOT / T3CODE_WORKTREE_PATH set
#   Manual:      ./scripts/t3code-worktree-setup.sh /path/to/worktree
set -euo pipefail

# Resolve paths — T3Code env vars or manual arg
if [ -n "${T3CODE_PROJECT_ROOT:-}" ] && [ -n "${T3CODE_WORKTREE_PATH:-}" ]; then
  ROOT="$T3CODE_PROJECT_ROOT"
  WT="$T3CODE_WORKTREE_PATH"
elif [ -n "${ROOT_WORKTREE_PATH:-}" ]; then
  # wt CLI compatibility
  ROOT="$ROOT_WORKTREE_PATH"
  WT="$(pwd)"
elif [ -n "${1:-}" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  WT="$1"
else
  echo "Usage: $0 <worktree-path>"
  echo "  Or set T3CODE_PROJECT_ROOT + T3CODE_WORKTREE_PATH"
  exit 1
fi

echo "==> Setting up worktree at $WT (root: $ROOT)"

# Print an env file without its DATABASE_URL lines.
without_database_url() {
  grep -Ev '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$1" || true
}

# Copy env files from the main checkout, except DATABASE_URL: each worktree
# gets its own database below instead of sharing the main checkout's.
if [ "$(cd "$ROOT" && pwd -P)" != "$(cd "$WT" && pwd -P)" ]; then
  for envfile in .env.local frontend/.env.local; do
    if [ -f "$ROOT/$envfile" ]; then
      mkdir -p "$WT/$(dirname "$envfile")"
      (umask 077 && without_database_url "$ROOT/$envfile" >"$WT/$envfile")
      echo "    Copied $envfile (without DATABASE_URL)"
    fi
  done
fi

# Install dependencies from the lockfiles. pnpm 11+ fails on unapproved build
# scripts (esbuild); the prebuilt optional binaries work without them, as in
# the Docker builds.
pnpm_install() {
  pnpm install --frozen-lockfile --config.strict-dep-builds=false
}

echo "==> Installing root dependencies"
cd "$WT" && pnpm_install

echo "==> Installing frontend dependencies"
cd "$WT/frontend" && pnpm_install

for service in media_service image_processing_service; do
  if [ -d "$WT/backend/$service" ]; then
    echo "==> Installing $service dependencies"
    cd "$WT/backend/$service" && pnpm_install
  fi
done

if [ -d "$WT/backend/discord-bot" ]; then
  echo "==> Installing discord-bot dependencies"
  cd "$WT/backend/discord-bot" && npm ci
fi

if [ -d "$WT/backend/renderer_service" ]; then
  echo "==> Installing renderer dependencies"
  cd "$WT/backend/renderer_service" && uv sync --frozen
fi

# Start this worktree's PostgreSQL, migrate it, and point the Next.js server at
# it. Next.js reads DATABASE_URL only from frontend/.env.local, not from the
# helper's frontend/.env.database.local.
echo "==> Starting this worktree's PostgreSQL"
cd "$WT/frontend"
if pnpm run db:local up && pnpm run db:migrate; then
  env_file="$WT/frontend/.env.local"
  tmp="$(mktemp "$env_file.XXXXXX")"
  {
    if [ -f "$env_file" ]; then without_database_url "$env_file"; fi
    grep '^DATABASE_URL=' "$WT/frontend/.env.database.local"
  } >"$tmp"
  mv "$tmp" "$env_file"
  echo "    Wrote this worktree's DATABASE_URL to frontend/.env.local"
else
  echo "warning: could not start or migrate this worktree's database." >&2
  echo "         Start Docker, then rerun: ./scripts/t3code-worktree-setup.sh $WT" >&2
fi

echo "==> Done! Worktree ready at $WT"
