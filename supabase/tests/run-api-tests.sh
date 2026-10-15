#!/bin/bash
# Runs the end-to-end API checks against the LOCAL Supabase stack (needs Docker and `npx supabase start` first).
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(npx --yes supabase@latest status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
API_URL="$API_URL" ANON_KEY="$ANON_KEY" node supabase/tests/api-test.mjs
