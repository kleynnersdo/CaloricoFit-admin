#!/usr/bin/env bash
# Release: merge → push → deploy VPS
# Uso: bash scripts/release.sh staging|main
#
# Flujo:
#   staging → merge ender → push origin staging → sync VPS staging
#   main    → merge staging → push origin main → sync VPS main
#
# Requiere working tree limpio (commit previo en ender).

set -euo pipefail

TARGET="${1:-}"
if [[ "$TARGET" != "staging" && "$TARGET" != "main" ]]; then
  echo "Uso: bash scripts/release.sh staging|main"
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SLUG="${VPS_APP_SLUG:?Define VPS_APP_SLUG en el entorno o export antes de ejecutar}"
SOURCE="ender"
[[ "$TARGET" == "main" ]] && SOURCE="staging"

cd "$APP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: hay cambios sin commit. Commitea en ender primero."
  git status --short
  exit 1
fi

CURRENT="$(git branch --show-current)"
echo "==> Release $APP_SLUG: $SOURCE → $TARGET (desde rama actual: $CURRENT)"

git fetch origin

echo "==> Merge $SOURCE → $TARGET"
git checkout "$TARGET"
git pull origin "$TARGET"
git merge "$SOURCE" --no-edit

echo "==> Push origin/$TARGET"
git push origin "$TARGET"

echo "==> Deploy VPS ($TARGET)"
export VPS_APP_SLUG="$APP_SLUG"
bash scripts/sync-vps.sh "$TARGET"

git checkout "$CURRENT"
echo "==> Release OK ($TARGET desplegado)"
