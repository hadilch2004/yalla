#!/bin/bash
# Runs the database rules against a throwaway local Postgres (port 54389, deleted afterwards).
# Needs Postgres installed (brew install postgresql@17). It never touches any other database.
#   ./supabase/tests/run-tests.sh
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")"
PORT=54389
D="$(mktemp -d "${TMPDIR:-/tmp}/yalla-pg.XXXXXX")"
cleanup() { pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"; }
trap cleanup EXIT
initdb -D "$D/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$D" -l "$D/log" -w start >/dev/null
P=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -f 00_stubs.sql
"${P[@]}" -f ../migrations/001_schema.sql
# the developer reset must remove everything, so the schema can be applied again cleanly
"${P[@]}" -f ../dev-reset.sql
"${P[@]}" -c "select case when count(*) = 0 then 'reset ok' else 'reset left ' || count(*) || ' tables' end from pg_tables where schemaname = 'public'" -t
"${P[@]}" -f ../migrations/001_schema.sql
"${P[@]}" ${VERBOSE:+-v verbose=1} -f 10_rules.sql
# 002_creator.sql: makes exactly one account the Creator, and the database refuses a second one
"${P[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'hadilch2004@gmail.com', '{\"name\":\"Hadil\",\"agreed\":\"true\"}'), (gen_random_uuid(), 'someone.else@example.test', '{\"name\":\"Someone\",\"agreed\":\"true\"}')"
"${P[@]}" -f ../migrations/002_creator.sql >/dev/null
"${P[@]}" -f ../migrations/002_creator.sql >/dev/null   # running it twice is fine
n=$("${P[@]}" -tAc "select count(*) from public.profiles where is_creator and id = (select id from auth.users where email = 'hadilch2004@gmail.com')")
total=$("${P[@]}" -tAc "select count(*) from public.profiles where is_creator")
if [ "$n" = "1" ] && [ "$total" = "1" ]; then echo "creator file: ok (exactly one Creator)"; else echo "creator file: FAILED ($n, $total)"; exit 1; fi
if "${P[@]}" -c "update public.profiles set is_creator = true where id = (select id from auth.users where email = 'someone.else@example.test')" 2>/dev/null; then echo "creator file: FAILED (a second Creator was allowed)"; exit 1; else echo "creator file: a second Creator is refused"; fi
