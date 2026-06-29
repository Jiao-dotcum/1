#!/usr/bin/env bash
# ============================================================
# Pixel Pal — one-shot Supabase backend setup
# ------------------------------------------------------------
# Run this from the repo root ON YOUR OWN MACHINE (it needs network
# access to api.supabase.com, which the Claude sandbox blocks).
#
# It will: run the DB schema, set the Web Push secrets, deploy the
# reminder Edge Function, and schedule it every minute.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_..."        # account > Access Tokens
#   export MY_EMAIL="you@example.com"             # Web Push contact subject
#   export VAPID_PRIVATE_KEY="..."                # the private push key
#   ./scripts/setup-supabase.sh
#
# Requires: bash, curl, node, and the Supabase CLI (npm i -g supabase).
# The access token + service_role key are secrets — this script never
# writes them to disk or commits them.
# ============================================================
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-wdzpnjawcxbiqiasiezp}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
: "${MY_EMAIL:?set MY_EMAIL}"
: "${VAPID_PRIVATE_KEY:?set VAPID_PRIVATE_KEY}"

# Public push key is non-secret — read it straight from the client config.
VAPID_PUBLIC_KEY="$(node -e 'import("./supabase-config.js").then(m=>process.stdout.write(m.VAPID_PUBLIC_KEY))' 2>/dev/null || true)"
if [ -z "${VAPID_PUBLIC_KEY}" ]; then
  VAPID_PUBLIC_KEY="BNPnpzjii_bDl9_bicPrHbd8i4yO-b8P44CJOxCnqvduFNHrCXot4LT6IkUrbLeU8gVSaM2-s0tPneV3lPnq1d0"
fi

auth=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

# Run a .sql file through the Management API "run query" endpoint.
run_sql_file() {
  local file="$1"
  node -e '
    const fs=require("fs");
    const sql=fs.readFileSync(process.argv[1],"utf8");
    process.stdout.write(JSON.stringify({query:sql}));
  ' "$file" \
  | curl -sS -X POST "${API}/database/query" "${auth[@]}" \
      -H "Content-Type: application/json" --data-binary @- \
      -w $'\nHTTP %{http_code}\n'
}

echo "==> 1/4  Applying database schema (tables, realtime, policies)…"
run_sql_file "${ROOT}/supabase/schema.sql"

echo "==> 2/4  Setting Edge Function secrets…"
node -e '
  const v=[
    {name:"VAPID_PUBLIC_KEY",  value:process.env.VAPID_PUBLIC_KEY},
    {name:"VAPID_PRIVATE_KEY", value:process.env.VAPID_PRIVATE_KEY},
    {name:"VAPID_SUBJECT",     value:"mailto:"+process.env.MY_EMAIL},
  ];
  process.stdout.write(JSON.stringify(v));
' VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  | curl -sS -X POST "${API}/secrets" "${auth[@]}" \
      -H "Content-Type: application/json" --data-binary @- \
      -w $'\nHTTP %{http_code}\n'

echo "==> 3/4  Deploying the fire-reminders Edge Function…"
( cd "${ROOT}" && SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN}" \
    supabase functions deploy fire-reminders --project-ref "${PROJECT_REF}" )

echo "==> 4/4  Scheduling it every minute (pg_cron)…"
SERVICE_ROLE_KEY="$(curl -sS "${API}/api-keys" "${auth[@]}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const k=JSON.parse(d).find(x=>x.name==="service_role");process.stdout.write(k?k.api_key:"");})')"
if [ -z "${SERVICE_ROLE_KEY}" ]; then
  echo "!! could not fetch service_role key — skipping cron. Run supabase/cron.sql manually." >&2
else
  CRON_SQL="$(sed -e "s/<PROJECT_REF>/${PROJECT_REF}/g" -e "s/<SERVICE_ROLE_KEY>/${SERVICE_ROLE_KEY}/g" "${ROOT}/supabase/cron.sql")"
  node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({query:process.env.CRON_SQL}))' CRON_SQL="${CRON_SQL}" \
    | curl -sS -X POST "${API}/database/query" "${auth[@]}" \
        -H "Content-Type: application/json" --data-binary @- \
        -w $'\nHTTP %{http_code}\n'
fi

echo
echo "✅ Done. Quick checks:"
echo "   • Supabase → Table editor: 'tasks' and 'push_subscriptions' exist"
echo "   • SQL editor: select * from cron.job;   (expect pixelpal-fire-reminders)"
echo "   • Now host the site (GitHub Pages) and 'Add to Home Screen' on your phone."
