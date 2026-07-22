#!/usr/bin/env bash
# Import a SQL dump into the local Docker MySQL (compose service: mysql).
# Usage:
#   ./scripts/db-import-local.sh path/to/dump.sql
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 path/to/dump.sql" >&2
  exit 1
fi

LOCAL_DB="${LOCAL_DB:-growth_mentor_local}"
LOCAL_USER="${LOCAL_USER:-gm}"
LOCAL_PASS="${LOCAL_PASS:-gm_local}"
ROOT_PASS="${MYSQL_ROOT_PASSWORD:-gm_root_local}"

echo "Ensuring local MySQL is up..."
docker compose up -d mysql

echo "Waiting for MySQL healthy..."
for i in $(seq 1 60); do
  if docker compose exec -T mysql mysqladmin ping -h127.0.0.1 -uroot -p"$ROOT_PASS" --silent 2>/dev/null; then
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "ERROR: MySQL did not become ready" >&2
    docker compose logs mysql | tail -40 >&2
    exit 1
  fi
done

echo "Recreating schema ${LOCAL_DB} and granting ${LOCAL_USER}..."
docker compose exec -T mysql mysql -uroot -p"$ROOT_PASS" -e "
  DROP DATABASE IF EXISTS \`${LOCAL_DB}\`;
  CREATE DATABASE \`${LOCAL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON \`${LOCAL_DB}\`.* TO '${LOCAL_USER}'@'%';
  FLUSH PRIVILEGES;
"

echo "Importing $(basename "$DUMP") into ${LOCAL_DB}..."
# Strip DEFINER clauses that often break on import with non-super users
sed -E 's/DEFINER[ ]*=[ ]*`[^`]+`@`[^`]+`/DEFINER=`'"${LOCAL_USER}"'`@`%`/g' "$DUMP" \
  | docker compose exec -T mysql mysql -u"$LOCAL_USER" -p"$LOCAL_PASS" "$LOCAL_DB"

echo "OK: imported into mysql://gm:***@127.0.0.1:3307/${LOCAL_DB}"
echo "Point .env.local at:"
echo "  DATABASE_URL=\"mysql://${LOCAL_USER}:${LOCAL_PASS}@127.0.0.1:3307/${LOCAL_DB}\""
