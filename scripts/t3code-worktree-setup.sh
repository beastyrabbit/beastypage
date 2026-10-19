#!/bin/sh
set -eu

repo_root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

main_checkout=${ROOT_WORKTREE_PATH-}
if [ -z "$main_checkout" ]; then
  main_checkout=$(git -C "$repo_root" worktree list --porcelain |
    awk '/^worktree / { print substr($0, 10); exit }')
fi

if [ -n "$main_checkout" ] && [ -d "$main_checkout" ]; then
  main_checkout=$(CDPATH= cd "$main_checkout" && pwd)
fi

copy_env_file() {
  source_file=$1
  target_file=$2

  if [ -n "$main_checkout" ] && [ "$main_checkout" = "$repo_root" ]; then
    printf '%s\n' "Skipping $source_file copy: this is the main checkout"
  elif [ -e "$target_file" ]; then
    printf '%s\n' "Environment file already exists: $target_file"
  elif [ -n "$main_checkout" ] && [ "$main_checkout" != "$repo_root" ] &&
    [ -f "$main_checkout/$source_file" ]; then
    printf '%s\n' "Copying $source_file from the main checkout"
    cp "$main_checkout/$source_file" "$target_file"
  else
    printf '%s\n' "Skipping $source_file copy: source file not found"
  fi
}

copy_env_file .env.local .env.local
copy_env_file frontend/.env.local frontend/.env.local

printf '%s\n' 'Installing root dependencies'
pnpm install --frozen-lockfile --config.confirmModulesPurge=false

printf '%s\n' 'Installing frontend dependencies'
pnpm --dir frontend install --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false

printf '%s\n' 'Installing media service dependencies'
pnpm --dir backend/media_service install --frozen-lockfile --config.confirmModulesPurge=false

printf '%s\n' 'Installing image processing service dependencies'
pnpm --dir backend/image_processing_service install --frozen-lockfile --config.confirmModulesPurge=false

printf '%s\n' 'Installing Discord bot dependencies'
npm --prefix backend/discord-bot ci

printf '%s\n' 'Installing renderer service dependencies'
uv sync --project backend/renderer_service --frozen --extra dev
