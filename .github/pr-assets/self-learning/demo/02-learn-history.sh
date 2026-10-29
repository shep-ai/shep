#!/usr/bin/env bash
# Recorded: after five rough runs on v1, the history flags it and shows the
# candidate Reflect proposed.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
say "Five runs later v1 is doing worse than v0, and Reflect proposed a candidate"
shep learn history --repo "$REPO"
