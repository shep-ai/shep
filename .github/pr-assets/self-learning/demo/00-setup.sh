#!/usr/bin/env bash
# Not recorded: a clean SHEP_HOME, one git repository, the dev agent (fixture
# answers, no account needed), the selfLearning and collaboration flags, a
# first learned-harness version imported by hand, and two pending features.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$DEMO_DIR" "$SHEP_HOME"
mkdir -p "$REPO"
(
  cd "$REPO"
  git init -q -b main
  printf '# shop\n\nCheckout, refunds and exports.\n' > README.md
  git add -A
  git -c user.email=demo@acme.dev -c user.name=Demo commit -qm init
)
touch "$STATE"
$SHEP settings agent --agent dev > /dev/null
$SHEP settings flags enable selfLearning > /dev/null
$SHEP settings flags enable collaboration > /dev/null
$SHEP learn adopt --from-dir "$HERE/harness-v0" --repo "$REPO" > /dev/null
for title in "Export refunds as CSV" "Add audit log for refunds"; do
  $SHEP feat new "$title" --repo "$REPO" --pending > /dev/null
done
node "$HERE/seed-history.mjs" baseline
echo "Demo ready in $DEMO_DIR (SHEP_HOME=$SHEP_HOME)"
