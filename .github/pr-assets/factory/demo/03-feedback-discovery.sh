#!/usr/bin/env bash
# Scene 3 — customer feedback intake and themes (spec 127), discovery (spec 128).
source "$(dirname "$0")/lib.sh"

say "A key for the support tool; shep prints it once"
type_line "shep feedback key create -s acme --name Zendesk"
OUT="$($SHEP feedback key create -s acme --name Zendesk 2>&1)"
FB_KEY="$(printf '%s' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | grep -oE 'shep_fb_[A-Za-z0-9_-]+' | head -1)"
printf 'FB_KEY=%s\n' "$FB_KEY" >> "$STATE"
# The key is a secret: shown shortened in the recording
printf '%s\n' "${OUT//$FB_KEY/${FB_KEY:0:14}…}"
sleep 0.6

say "The support tool posts feedback over HTTP"
show_run "curl -s -X POST $UI/api/feedback -H 'Authorization: Bearer ${FB_KEY:0:14}…' -H 'Content-Type: application/json' -d '{\"text\":\"Invoices are missing the PO number\",\"customer\":\"Hooli\",\"monthlyRevenue\":1200,\"externalId\":\"zd-811\"}'" \
  "curl -s -X POST $UI/api/feedback -H 'Authorization: Bearer $FB_KEY' -H 'Content-Type: application/json' -d '{\"text\":\"Invoices are missing the PO number\",\"customer\":\"Hooli\",\"monthlyRevenue\":1200,\"externalId\":\"zd-811\"}'"
for body in \
  '{"text":"PO number missing on our invoices","customer":"Initrode","monthlyRevenue":800,"externalId":"zd-812"}' \
  '{"text":"Please add the PO number to invoices","customer":"Vandelay","externalId":"zd-813","urgent":true}'; do
  curl -s -X POST "$UI/api/feedback" -H "Authorization: Bearer $FB_KEY" -H 'Content-Type: application/json' -d "$body"
  echo
done
run "curl -s -o /dev/null -w '%{http_code}\n' -X POST $UI/api/feedback -H 'Authorization: Bearer shep_fb_fake_key_for_401' -d '{\"text\":\"x\"}'"

say "Similar signals group into themes"
shep feedback themes -s acme
THEME="$(printf '%s' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)"
shep feedback promote "$THEME" -s acme --hours 3 --confidence 0.7 --title "PO number on invoices"

say "Discovery: an agent reads the loose signals and proposes bets"
shep signal add "Exports time out for large accounts" -s acme -k feedback -c Globex
shep signal add "CSV export of 50k orders never finishes" -s acme -k feedback -c Hooli
shep discovery run -s acme
shep discovery schedule -s acme --every 24
shep discovery ls -s acme
