#!/usr/bin/env bash
# Dump the local Docker MySQL (compose service: mysql) to a SQL file.
# Usage:
#   ./scripts/db-dump-local.sh
#   ./scripts/db-dump-local.sh backups/mysql/growth-mentor-latest.sql
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCAL_DB="${LOCAL_DB:-growth_mentor_local}"
ROOT_PASS="${MYSQL_ROOT_PASSWORD:-gm_root_local}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-$ROOT/backups/mysql/growth-mentor-${STAMP}.sql}"
mkdir -p "$(dirname "$OUT")"

echo "Ensuring local MySQL is up..."
docker compose up -d mysql >/dev/null

echo "Waiting for MySQL healthy..."
for i in $(seq 1 60); do
  if docker compose exec -T mysql mysqladmin ping -h127.0.0.1 -uroot -p"$ROOT_PASS" --silent 2>/dev/null; then
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "ERROR: MySQL did not become ready" >&2
    exit 1
  fi
done

echo "Dumping ${LOCAL_DB} -> ${OUT}"
docker compose exec -T mysql mysqldump \
  -uroot -p"$ROOT_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$LOCAL_DB" >"$OUT"

# Keep a stable "latest" pointer next to dated dumps when writing under backups/mysql/
if [[ "$OUT" == *"/backups/mysql/"* ]]; then
  cp -f "$OUT" "$ROOT/backups/mysql/growth-mentor-latest.sql"
  echo "Also updated backups/mysql/growth-mentor-latest.sql"
fi

echo "OK: $(wc -c <"$OUT") bytes -> $OUT"
echo "Restore on another machine:"
echo "  pnpm db:up && pnpm db:import $OUT"
