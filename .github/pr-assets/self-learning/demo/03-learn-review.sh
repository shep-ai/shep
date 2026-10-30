#!/usr/bin/env bash
# Recorded: what the candidate changes, and why.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
say "What the candidate changes and why — its edit verdicts stay Untested until a run tries it"
shep learn show "$CANDIDATE"
shep learn diff "$V1" "$CANDIDATE"
