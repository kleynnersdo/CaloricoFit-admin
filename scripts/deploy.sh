#!/usr/bin/env bash
set -euo pipefail
BRANCH="${1:-staging}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="caloricofit-api"
NGINX_STAGING="caloricofit-staging.conf"

cd "$APP_DIR"

echo "==> CaloricoFit deploy (branch: $BRANCH)"

if [[ -d .git ]]; then
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "    (sin .git — deploy desde tarball/local)"
fi

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env — copia .env.production.example y configura valores"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requerido en .env}"
: "${VITE_LOCAL_API_URL:?VITE_LOCAL_API_URL requerido en .env}"

export POSTGRES_PASSWORD
export DATABASE_URL="${DATABASE_URL:-postgresql://calorico:${POSTGRES_PASSWORD}@127.0.0.1:5432/caloricofit}"
export LOCAL_API_PORT="${LOCAL_API_PORT:-3032}"

echo "==> Postgres"
docker compose -f docker-compose.prod.yml up -d

echo "==> Esperando DB..."
for i in {1..30}; do
  if docker exec caloricofit-prod-db pg_isready -U calorico -d caloricofit >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
  echo "==> Admin inicial (si no existe)"
  docker exec -i caloricofit-prod-db psql -U calorico -d caloricofit <<EOSQL
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '${ADMIN_EMAIL}',
  '{"first_name":"Admin","last_name":"Principal","role":"admin","document_id":"V00000001"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.worker_profiles (id, email, document_id, first_name, last_name, role, password, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '${ADMIN_EMAIL}',
  'V00000001',
  'Admin',
  'Principal',
  'admin',
  '${ADMIN_PASSWORD}',
  true
) ON CONFLICT (id) DO NOTHING;
EOSQL
fi

echo "==> Build frontend"
npm ci
npm run build

echo "==> API (pm2)"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start server/local-api.mjs --name "$APP_NAME" --update-env
pm2 save

if [[ "${INSTALL_NGINX:-}" == "1" ]]; then
  echo "==> nginx staging"
  sudo cp deploy/nginx/"$NGINX_STAGING" /etc/nginx/sites-available/caloricofit-staging.conf
  sudo ln -sf /etc/nginx/sites-available/caloricofit-staging.conf /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "==> Deploy OK — http://162.141.78.230:8080"
