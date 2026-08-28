#!/usr/bin/env bash
# Borra TODA la data de producción y recrea schema + admin.
# Uso: bash scripts/reset-prod-db.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: falta .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requerido}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL requerido}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD requerido}"

export POSTGRES_PASSWORD

echo "==> ATENCIÓN: borrando volumen Postgres (irreversible)"
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d

echo "==> Esperando DB..."
for i in {1..30}; do
  if docker exec caloricofit-prod-db pg_isready -U calorico -d caloricofit >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Admin producción"
docker exec -i caloricofit-prod-db psql -U calorico -d caloricofit <<EOSQL
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '${ADMIN_EMAIL}',
  '{"first_name":"Admin","last_name":"Principal","role":"admin","document_id":"V00000001"}'::jsonb
);

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
);
EOSQL

echo "==> DB limpia OK"
