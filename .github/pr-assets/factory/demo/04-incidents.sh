#!/usr/bin/env bash
# Scene 4 — production incidents, triage and runtime actions (spec 129).
# kubectl here is a stub that answers like a healthy cluster.
source "$(dirname "$0")/lib.sh"

say "A monitoring tool posts an alert with the space's intake key"
ALERT='{"title":"Checkout 5xx above 5%","severity":"Critical","detail":"Error rate on POST /checkout rose from 0.2% to 7% at 09:58.","url":"https://grafana.acme.dev/d/checkout","namespace":"shop","workload":"checkout","context":"prod","externalId":"grafana-812"}'
show_run "curl -s -X POST $UI/api/alerts -H 'Authorization: Bearer ${FB_KEY:0:14}…' -H 'Content-Type: application/json' -d '$ALERT'" \
  "curl -s -X POST $UI/api/alerts -H 'Authorization: Bearer $FB_KEY' -H 'Content-Type: application/json' -d '$ALERT'"
say "The same alert again is a note, not a second incident"
show_run "curl -s -X POST $UI/api/alerts -H 'Authorization: Bearer ${FB_KEY:0:14}…' -d '…same alert…'" \
  "curl -s -X POST $UI/api/alerts -H 'Authorization: Bearer $FB_KEY' -H 'Content-Type: application/json' -d '$ALERT'"
shep incident ls --open
remember INC_CHECKOUT

say "Triage: evidence from the workload, ranked causes, one proposed action"
shep incident triage "$INC_CHECKOUT"
shep incident show "$INC_CHECKOUT"
ACTION="$(printf '%s' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | grep -i 'rollback' | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)"

say "Acme only lets shep restart on its own, so the rollback waits for a person"
shep incident approve "$ACTION"

say "Restarts are allowed: a person's action runs at once"
shep incident act "$INC_CHECKOUT" restart --reason "Clear stuck connections"
shep incident note "$INC_CHECKOUT" "Tax service vendor confirmed a schema change in 4.12"

say "A second, minor incident opened by hand"
shep incident open "Search is slow" -s acme --severity minor --workload search --namespace shop
remember INC_SEARCH
shep incident resolve "$INC_CHECKOUT"
