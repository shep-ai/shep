#!/usr/bin/env bash
# Not recorded: a clean SHEP_HOME, two local git repositories, a stub kubectl
# that answers like a healthy cluster, and the dev agent (fixture answers, no
# account needed).
set -euo pipefail
DEMO_DIR="${DEMO_DIR:-/tmp/shep-demo}"
SHEP="${SHEP:-node dist/src/presentation/cli/index.js}"
rm -rf "$DEMO_DIR" "$SHEP_HOME"
mkdir -p "$DEMO_DIR/bin"
cp "$(dirname "$0")/kubectl-stub.sh" "$DEMO_DIR/bin/kubectl"
chmod +x "$DEMO_DIR/bin/kubectl"
for repo in work/pay-api personal/blog; do
  mkdir -p "$DEMO_DIR/$repo/docs"
  (
    cd "$DEMO_DIR/$repo"
    git init -q -b main
    printf '# %s\n\nRefunds and checkout.\n' "$(basename "$repo")" > README.md
    echo '# Guide' > docs/guide.md
    git add -A
    git -c user.email=demo@acme.dev -c user.name=Demo commit -qm init
  )
done
$SHEP settings agent --agent dev > /dev/null
echo "Demo ready in $DEMO_DIR (SHEP_HOME=$SHEP_HOME)"
