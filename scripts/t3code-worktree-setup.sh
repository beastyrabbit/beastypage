#!/usr/bin/env bash
# Worktree setup — copies env files and installs all dependencies.
#
# Usage:
#   From T3Code: runs automatically with T3CODE_PROJECT_ROOT / T3CODE_WORKTREE_PATH
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

# Copy env files from main repo
for envfile in .env.local frontend/.env.local; do
  if [ -f "$ROOT/$envfile" ]; then
    mkdir -p "$WT/$(dirname "$envfile")"
    cp "$ROOT/$envfile" "$WT/$envfile"
    echo "    Copied $envfile"
  fi
done

# Install dependencies. pnpm 11+ fails on unapproved build scripts (esbuild);
# the prebuilt optional binaries work without them, as in the Docker builds.
pnpm_install() {
  pnpm install --config.strict-dep-builds=false
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
  cd "$WT/backend/renderer_service" && uv sync
fi

echo "==> Done! Worktree ready at $WT"
