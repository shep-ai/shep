#!/usr/bin/env bash
# Scene 2 — signals and opportunities ranked by value per review hour (spec 126).
source "$(dirname "$0")/lib.sh"

say "Evidence of what users need: who asked, revenue at stake, urgency"
shep signal add "Guest checkout times out on mobile" -s acme -k feedback -c Globex -r 4000 -u
remember SIG_GLOBEX
shep signal add "Checkout spinner never ends for guests" -s acme -k feedback -c Initech -r 2500
remember SIG_INITECH
shep signal add "Need SSO before the security review" -s acme -k tracker -c Umbrella -r 9000
remember SIG_SSO
shep signal add "p95 checkout latency above 4s" -s acme -k incident -u
remember SIG_LATENCY

say "Bets backed by that evidence"
shep opportunity add "Faster guest checkout" -s acme --hours 6 --confidence 0.8 -p "Guests abandon checkout when it hangs"
remember OPP_CHECKOUT
shep opportunity link "$SIG_GLOBEX" "$OPP_CHECKOUT"
shep opportunity link "$SIG_INITECH" "$OPP_CHECKOUT"
shep opportunity link "$SIG_LATENCY" "$OPP_CHECKOUT"
shep opportunity add "SSO for enterprise" -s acme --hours 20 --confidence 0.6 --strategic -p "Deals stall at security review"
remember OPP_SSO
shep opportunity link "$SIG_SSO" "$OPP_SSO"
shep opportunity add "Dark mode" -s acme --hours 8 --confidence 0.3
remember OPP_DARK
shep opportunity accept "$OPP_CHECKOUT"
shep opportunity accept "$OPP_SSO"

say "Acme reviews 16 hours a week: the line shows what fits"
shep opportunity weights -s acme --capacity 16 --revenue 2
shep opportunity ls -s acme
shep opportunity show "$OPP_CHECKOUT"
