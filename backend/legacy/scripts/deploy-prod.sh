#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/webpage-frontend
INFRA_DIR=/srv/webpage-backend

log() {
  echo "[deploy] $1"
}

log "Updating app repo"
cd "$APP_DIR"
git fetch origin
git switch main
git pull --ff-only

log "Updating infra repo"
cd "$INFRA_DIR"
git fetch origin
git pull --ff-only

log "Copying configs"
sudo cp "$INFRA_DIR/caddy/Caddyfile" /etc/caddy/Caddyfile
sudo cp "$INFRA_DIR/systemd/pocketbase.service" /etc/systemd/system/pocketbase.service

if [ -f "$INFRA_DIR/systemd/caddy.service.d/unsplash.conf" ]; then
  log "Copying local Unsplash drop-in"
  sudo install -m 0640 "$INFRA_DIR/systemd/caddy.service.d/unsplash.conf" \
    /etc/systemd/system/caddy.service.d/unsplash.conf
else
  log "Skip drop-in secret; ensure /etc/systemd/system/caddy.service.d/unsplash.conf is up to date"
fi

log "Reloading services"
sudo systemctl daemon-reload
sudo systemctl restart pocketbase || log "pocketbase.service not present; skip restart"
sudo systemctl reload caddy

log "Smoke tests"
log "Waiting for services to settle"
sleep 3
curl -fsSI http://127.0.0.1:8000/ | head -n 1
curl -fsS "http://127.0.0.1:8000/api/unsplash/photos/random?query=cat"

log "Done"
