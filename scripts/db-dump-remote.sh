#!/usr/bin/env bash
# Dump a MySQL database to a local SQL file.
#
# Connection source (first match wins):
#   1) $REMOTE_DATABASE_URL
#   2) $DATABASE_URL if it does NOT look like the local docker DB
#   3) commented "# DATABASE_URL=..." remote line in .env.local
#
# Usage:
#   ./scripts/db-dump-remote.sh
#   ./scripts/db-dump-remote.sh /path/to/out.sql
#   REMOTE_DATABASE_URL='mysql://...' ./scripts/db-dump-remote.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

is_local_url() {
  local u="$1"
  [[ "$u" == *"127.0.0.1:3307"* ]] || [[ "$u" == *"localhost:3307"* ]] || [[ "$u" == *"/growth_mentor_local"* ]]
}

strip_quotes() {
  sed 's/^["'\'']//;s/["'\'']$//' <<<"$1"
}

URL="${REMOTE_DATABASE_URL:-}"

if [[ -z "$URL" && -n "${DATABASE_URL:-}" ]] && ! is_local_url "$DATABASE_URL"; then
  URL="$DATABASE_URL"
fi

if [[ -z "$URL" && -f .env.local ]]; then
  # Prefer explicit remote override in env file
  if grep -qE '^REMOTE_DATABASE_URL=' .env.local; then
    URL="$(strip_quotes "$(grep -E '^REMOTE_DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)")"
  fi
fi

if [[ -z "$URL" && -f .env.local ]]; then
  # Active DATABASE_URL if not local
  if grep -qE '^DATABASE_URL=' .env.local; then
    CAND="$(strip_quotes "$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)")"
    if ! is_local_url "$CAND"; then
      URL="$CAND"
    fi
  fi
fi

if [[ -z "$URL" && -f .env.local ]]; then
  # Commented previous remote line: # DATABASE_URL="mysql://..."
  if grep -qE '^# *DATABASE_URL=' .env.local; then
    while IFS= read -r line; do
      CAND="$(strip_quotes "$(echo "$line" | sed -E 's/^# *DATABASE_URL=//')")"
      if [[ "$CAND" == mysql://* ]] && ! is_local_url "$CAND"; then
        URL="$CAND"
        break
      fi
    done < <(grep -E '^# *DATABASE_URL=' .env.local)
  fi
fi

if [[ -z "$URL" ]]; then
  echo "ERROR: no remote DATABASE_URL found." >&2
  echo "Set REMOTE_DATABASE_URL, or keep a commented remote DATABASE_URL= in .env.local" >&2
  exit 1
fi

OUT="${1:-$ROOT/tmp/remote-dump-$(date +%Y%m%d-%H%M%S).sql}"
mkdir -p "$(dirname "$OUT")"

# Parse with Python (handles URL-encoding in password)
eval "$(python3 - "$URL" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
if u.scheme != "mysql":
    raise SystemExit("not a mysql:// URL")
user = urllib.parse.unquote(u.username or "")
password = urllib.parse.unquote(u.password or "")
host = u.hostname or "127.0.0.1"
port = u.port or 3306
db = (u.path or "/").lstrip("/").split("?")[0]
def sh(s: str) -> str:
    return "'" + s.replace("'", "'\"'\"'") + "'"
print(f"USER={sh(user)}")
print(f"PASS={sh(password)}")
print(f"HOST={sh(host)}")
print(f"PORT={port}")
print(f"DB={sh(db)}")
PY
)"

echo "Dumping ${USER}@${HOST}:${PORT}/${DB} -> ${OUT}"

if command -v mysqldump >/dev/null 2>&1; then
  mysqldump \
    -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" \
    --single-transaction \
    --routines \
    --triggers \
    --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 \
    "$DB" >"$OUT"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm mysql:8.0 \
    mysqldump \
    -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" \
    --single-transaction \
    --routines \
    --triggers \
    --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 \
    "$DB" >"$OUT"
else
  echo "ERROR: need mysqldump or docker" >&2
  exit 1
fi

echo "OK: $(wc -c <"$OUT") bytes -> $OUT"
echo "Next: ./scripts/db-import-local.sh $OUT"
