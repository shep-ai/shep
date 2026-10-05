#!/usr/bin/env bash
# Scene 5 — following shipped opportunities to their outcomes (spec 130).
source "$(dirname "$0")/lib.sh"

say "Build the best bet into the Payments project"
shep opportunity build "$OPP_CHECKOUT" --project payments

say "When the work item is done, shep ships the opportunity (or by hand)"
shep outcome ship "$OPP_CHECKOUT"
PO_OPP="$($SHEP opportunity ls -s acme 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep 'PO number on invoices' | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)"
shep outcome ship "$PO_OPP"

say "Demo only: pretend the PO number fix shipped 15 days ago, then let shep judge it"
run "node .github/pr-assets/factory/demo/backdate-outcome.mjs $PO_OPP 15"
shep outcome check
shep outcome ls -s acme

say "Tell the customers who asked, then mark them told"
shep outcome tell "$OPP_CHECKOUT"
shep outcome tell "$OPP_CHECKOUT" --done
shep outcome hours "$OPP_CHECKOUT" 9
shep outcome ls -s acme
