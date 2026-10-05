#!/usr/bin/env bash
# Scene 6 — autopilot and factory status (spec 132), with docs first (spec 131).
source "$(dirname "$0")/lib.sh"

say "Dark mode is accepted too; at 8 hours it fits the week's line"
shep opportunity accept "$OPP_DARK"

say "Let Acme run on autopilot: investigate urgent bugs, fix confident ones, fill the line"
shep autopilot set -s acme --investigate --fix --budget 3 --fill-line --project payments
shep autopilot run -s acme
shep autopilot show -s acme

say "The investigation autopilot started, and the fix it began"
shep item hypotheses PAY-1
shep feat ls

say "Everything that is moving, and everything waiting on people"
shep factory status -s acme
