#!/bin/bash
# A throwaway local backend for trying the app in a browser, no Docker and no account needed:
# Postgres (with the real schema and rules) + PostgREST + a small fake login/photo gateway.
#   ./supabase/tests/dev-stack.sh start    then in the app: Me tab is not needed, see dev-config below
#   ./supabase/tests/dev-stack.sh stop
#   ./supabase/tests/dev-stack.sh reset    (stop, delete all data, start again)
# Gateway: http://127.0.0.1:54397   (use this as the Supabase URL; any text works as the key)
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")"
HERE="$PWD"
T="${TMPDIR:-/tmp}"; ROOT="${T%/}/yalla-dev-stack"
PGPORT=54399; RESTPORT=54398; GWPORT=54397
SECRET="dev-secret-dev-secret-dev-secret-dev-1234"
case "${1:-start}" in
  stop)
    [ -f "$ROOT/gateway.pid" ] && kill "$(cat "$ROOT/gateway.pid")" 2>/dev/null || true
    [ -f "$ROOT/postgrest.pid" ] && kill "$(cat "$ROOT/postgrest.pid")" 2>/dev/null || true
    pg_ctl -D "$ROOT/data" -m fast stop >/dev/null 2>&1 || true
    rm -f "$ROOT"/*.pid; echo "stopped"; exit 0 ;;
  reset) "$0" stop; rm -rf "$ROOT"; exec "$0" start ;;
  start) ;;
  *) echo "usage: $0 start|stop|reset"; exit 2 ;;
esac
mkdir -p "$ROOT"
if [ ! -d "$ROOT/data" ]; then
  initdb -D "$ROOT/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  FRESH=1
fi
pg_ctl -D "$ROOT/data" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$ROOT" -l "$ROOT/pg.log" -w start >/dev/null
P=(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
if [ "${FRESH:-}" = 1 ]; then
  "${P[@]}" -f "$HERE/00_stubs.sql" 2>/dev/null
  "${P[@]}" -f "$HERE/../migrations/001_schema.sql"
fi
cat > "$ROOT/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = $RESTPORT
CONF
nohup postgrest "$ROOT/postgrest.conf" >"$ROOT/postgrest.log" 2>&1 & echo $! >"$ROOT/postgrest.pid"
nohup env PORT=$GWPORT REST_PORT=$RESTPORT PG_PORT=$PGPORT JWT_SECRET="$SECRET" FILES_DIR="$ROOT/files" node "$HERE/dev-gateway.mjs" >"$ROOT/gateway.log" 2>&1 & echo $! >"$ROOT/gateway.pid"
for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$GWPORT/health" && curl -s -o /dev/null "http://127.0.0.1:$RESTPORT/" && break; sleep 0.25; done
echo "backend ready: http://127.0.0.1:$GWPORT   (data and logs in $ROOT)"
