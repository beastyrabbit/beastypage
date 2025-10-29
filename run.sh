#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend/renderer_service"

usage() {
  cat <<'EOF'
Usage: run.sh [options]

Options:
  (no flag)   Start the frontend (bun run dev) and renderer service (uv run uvicorn).
  -d, --deploy  Run convex deploy from the frontend directory and exit.
  -h, --help    Show this help message.
EOF
}

PIDS=()

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[run.sh] Error: required command '$1' not found" >&2
    exit 127
  fi
}

cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
}

deploy() {
  require_cmd bun
  echo "[run.sh] Running convex deploy"
  (cd "$FRONTEND_DIR" && bunx convex deploy)
}

start_dev() {
  require_cmd bun
  require_cmd uv
  trap 'cleanup; exit 0' INT TERM
  trap cleanup EXIT

  (
    cd "$FRONTEND_DIR"
    echo "[run.sh] Starting frontend dev server"
    bun run dev
  ) &
  PIDS+=($!)

  (
    cd "$BACKEND_DIR"
    echo "[run.sh] Starting renderer service"
    uv run uvicorn renderer_service.app.main:app --reload --host 0.0.0.0 --port 8001
  ) &
  PIDS+=($!)

  wait "${PIDS[@]}"
}

case "${1:-}" in
  "")
    start_dev
    ;;
  -d|--deploy)
    deploy
    ;;
  -h|--help)
    usage
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage >&2
    exit 1
    ;;
esac
