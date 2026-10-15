#!/bin/bash
# Checks the data API (what the app actually calls) with PostgREST on top of a throwaway Postgres.
# Needs: postgresql and postgrest installed (brew install postgresql@17 postgrest). No Docker, touches nothing else.
#   ./supabase/tests/run-rest-tests.sh
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")"
PGPORT=54389; APIPORT=54388
SECRET="test-secret-test-secret-test-secret-1234"
D="$(mktemp -d "${TMPDIR:-/tmp}/yalla-rest.XXXXXX")"
cleanup() { [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null || true; pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"; }
trap cleanup EXIT
initdb -D "$D/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$D/data" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$D" -l "$D/log" -w start >/dev/null
P=(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -f 00_stubs.sql 2>/dev/null
"${P[@]}" -f ../migrations/001_schema.sql
cat > "$D/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = $APIPORT
CONF
postgrest "$D/postgrest.conf" >"$D/postgrest.log" 2>&1 &
PGRST_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$APIPORT/" && break; sleep 0.5; done
MODE=rest API_URL="http://127.0.0.1:$APIPORT" JWT_SECRET="$SECRET" PGPORT="$PGPORT" node api-test.mjs || { echo "--- postgrest log ---"; tail -20 "$D/postgrest.log"; exit 1; }
