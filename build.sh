#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend/renderer_service"

if ! command -v bun >/dev/null 2>&1; then
  echo "[build.sh] Error: bun is required to build the frontend" >&2
  exit 127
fi

echo "[build.sh] Installing frontend dependencies"
(cd "$FRONTEND_DIR" && bun install)

echo "[build.sh] Building frontend"
(cd "$FRONTEND_DIR" && bun run build)

if command -v uv >/dev/null 2>&1; then
  echo "[build.sh] Synchronizing renderer service dependencies"
  (cd "$BACKEND_DIR" && uv sync)
else
  echo "[build.sh] Skipping renderer dependency sync (uv not found)"
fi

echo "[build.sh] Done"
