#!/usr/bin/env bash
# Scene 1 — spaces, per-space policy (specs 120, 121, 124, 129, 131) and a project.
source "$(dirname "$0")/lib.sh"

say "Keep client work and personal work apart"
shep space new Acme -d "Client work for Acme" -c "#3456c4"
shep space new Personal -d "Side projects" --default
shep space line new acme Payments
shep space rule add acme "$DEMO_DIR/work" -l payments
shep repo import "$DEMO_DIR/work" --all --git-only
shep space show "$DEMO_DIR/work/pay-api"

say "How agents run in Acme: PR comments, runtime actions on incidents, docs first"
shep space config acme --pr-comments all --resolve-threads --auto-actions restart --docs-first --docs-paths docs/,README.md

say "A project whose repository is the Acme payments API, with an urgent bug"
shep project new --name Payments --prefix PAY --repo "$DEMO_DIR/work/pay-api"
shep item new payments -t "Refund fails for guest orders" -p urgent -d "Refunding a guest order returns 500 since 4.12."
shep item new payments -t "Show the PO number on invoices" -p medium
shep space ls
