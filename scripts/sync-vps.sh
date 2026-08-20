#!/usr/bin/env bash
# Sincroniza el repo local al VPS y ejecuta deploy.sh
# Uso: bash scripts/sync-vps.sh [staging|main]

set -euo pipefail

BRANCH="${1:-staging}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SLUG="${VPS_APP_SLUG:?Define VPS_APP_SLUG (caloricofit|latintravel)}"
VPS_HOST="${VPS_SSH_HOST:-hostkey-vps}"
VPS_PATH="/opt/apps/${APP_SLUG}"
TARBALL="/tmp/${APP_SLUG}-deploy.tgz"

cd "$APP_DIR"

echo "==> Sync $APP_SLUG → VPS ($BRANCH)"

tar -czf "$TARBALL" \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.production \
  .

scp "$TARBALL" "${VPS_HOST}:/tmp/${APP_SLUG}-deploy.tgz"

ssh "$VPS_HOST" "mkdir -p ${VPS_PATH} && cd ${VPS_PATH} && tar xzf /tmp/${APP_SLUG}-deploy.tgz && rm /tmp/${APP_SLUG}-deploy.tgz && tr -d '\r' < scripts/deploy.sh > /tmp/d.sh && mv /tmp/d.sh scripts/deploy.sh && chmod +x scripts/deploy.sh && bash scripts/deploy.sh ${BRANCH}"

rm -f "$TARBALL"
echo "==> Sync OK"
