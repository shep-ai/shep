#!/usr/bin/env bash
# Recorded: the learned harness from the CLI — status, importing a hand-written
# version, and the history with outcome metrics.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
say "Self-learning is opt-in: the selfLearning flag is on; this repository runs on v0"
shep learn status --repo "$REPO"
say "A person can write a harness by hand: it is validated like a learned one, then adopted"
shep learn adopt --from-dir "$(dirname "$0")/harness-v1" --repo "$REPO"
shep learn history --repo "$REPO"
say "One feature in Explore mode, whatever the learning mode: 4k attempts, the best one is kept"
shep feat new "Stream refund exports" --repo "$REPO" --explore-harness --explore-k 2 --pending
