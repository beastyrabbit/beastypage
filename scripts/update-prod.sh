#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[beastypage-update] %s\n' "$*"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$SCRIPT_DIR/frontend" ]; then
  REPO_ROOT="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/../frontend" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -d "$SCRIPT_DIR/beastypage/frontend" ]; then
  REPO_ROOT="$SCRIPT_DIR/beastypage"
elif [ -d "$SCRIPT_DIR/../beastypage/frontend" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/../beastypage" && pwd)"
else
  printf 'Unable to locate the beastypage repository relative to %s.\n' "$SCRIPT_DIR" >&2
  printf 'Place this script inside the repo or its parent directory.\n' >&2
  exit 1
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
CANONICAL_SCRIPT="$REPO_ROOT/scripts/update-prod.sh"
TARGET_SCRIPT="$(dirname "$REPO_ROOT")/update-beastypage.sh"

log "Repository root: $REPO_ROOT"

log "Fetching and pulling latest changes"
git -C "$REPO_ROOT" fetch --prune
git -C "$REPO_ROOT" pull --ff-only

if [ ! -d "$FRONTEND_DIR" ]; then
  printf 'Frontend directory not found at %s\n' "$FRONTEND_DIR" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  printf 'bun is required but not found in PATH.\n' >&2
  exit 1
fi

log "Installing frontend dependencies"
pushd "$FRONTEND_DIR" >/dev/null
bun install

log "Building production bundle"
bun run build

log "Deploying Convex functions"
bunx convex deploy
popd >/dev/null

if ! command -v pm2 >/dev/null 2>&1; then
  printf 'pm2 is required but not found in PATH.\n' >&2
  exit 1
fi

APPS=(
  beastypage-hub
  beastypage-gatcha
  beastypage-stream
  beastypage-collection
  beastypage-personal
  beastypage-renderer
)

reloaded_any=false
for app in "${APPS[@]}"; do
  if pm2 describe "$app" >/dev/null 2>&1; then
    log "Reloading PM2 app: $app"
    pm2 reload "$app"
    reloaded_any=true
  fi
done

if [ "$reloaded_any" = false ]; then
  log "No existing PM2 apps detected. Starting from ecosystem.config.cjs"
  pm2 start "$REPO_ROOT/ecosystem.config.cjs"
fi

pm2 save

if [ -f "$CANONICAL_SCRIPT" ]; then
  cp "$CANONICAL_SCRIPT" "$TARGET_SCRIPT"
  chmod +x "$TARGET_SCRIPT"
  log "Updated helper script copy at $TARGET_SCRIPT"
else
  log "Canonical script not found at $CANONICAL_SCRIPT"
fi

log "Update complete"
