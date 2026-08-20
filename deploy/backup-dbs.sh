#!/usr/bin/env bash
# Backups diarios PostgreSQL → Bunny.net Storage
# Configurar /opt/backups/.env con credenciales Bunny (ver docs abajo)

set -euo pipefail

ENV_FILE="/opt/backups/.env"
CREDS_FILE="/opt/backups/.env.credentials"
LOG="/opt/backups/backup.log"
LOCAL_DIR="/opt/backups/dumps"
RETENTION_DAYS=7

mkdir -p "$LOCAL_DIR"

if [[ -f "$CREDS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  set +a
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DATE=$(date +%Y-%m-%d_%H%M)
TIMESTAMP=$(date -Iseconds)

log() { echo "[$TIMESTAMP] $*" | tee -a "$LOG"; }

backup_db() {
  local name="$1"
  local container="$2"
  local user="$3"
  local db="$4"
  local outfile="$LOCAL_DIR/${name}_${DATE}.sql.gz"

  log "Dump $name..."
  docker exec "$container" pg_dump -U "$user" "$db" | gzip > "$outfile"
  log "OK $outfile ($(du -h "$outfile" | cut -f1))"

  if [[ -n "${BUNNY_STORAGE_ZONE:-}" && -n "${BUNNY_API_KEY:-}" && -n "${BUNNY_REGION:-}" ]]; then
    local remote="bunny:${BUNNY_STORAGE_ZONE}/vps/${name}/$(basename "$outfile")"
    log "Upload → $remote"
    rclone copyto "$outfile" "$remote" --s3-provider Other \
      --s3-endpoint "https://${BUNNY_REGION}.storage.bunnycdn.com" 2>/dev/null || \
    rclone copyto "$outfile" "$remote"
    log "Upload OK"
  else
    log "SKIP upload Bunny (falta BUNNY_* en /opt/backups/.env)"
  fi
}

backup_db "caloricofit" "caloricofit-prod-db" "calorico" "caloricofit"
backup_db "latintravel" "latintravel-prod-db" "latintravel" "latintravel"

find "$LOCAL_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
log "Limpieza local >${RETENTION_DAYS}d"

log "Backup completo"
