#!/usr/bin/env bash
# Replays every capture in order: setup, CLI scenes, the history seed, the TUI
# walk (which adopts the candidate), then the web walk on `shep ui`.
# Run from the repository root after `pnpm build:release`.
set -euo pipefail
export DEMO_DIR="${DEMO_DIR:-/tmp/shep-learn-demo}" SHEP_HOME="${SHEP_HOME:-/tmp/shep-learn-home}"
export DO_NOT_TRACK=1
D=.github/pr-assets/self-learning/demo
A=.github/pr-assets/self-learning
SHEP="node dist/src/presentation/cli/index.js"
bash $D/00-setup.sh > /dev/null 2>&1
OUT=$A/cli COLS=132 ROWS=42 node $D/record-terminal.mjs 01-learn-cli "bash $D/01-learn-cli.sh"
node $D/seed-history.mjs history
for scene in 02-learn-history 03-learn-review; do
  OUT=$A/cli COLS=132 ROWS=42 node $D/record-terminal.mjs $scene "bash $D/$scene.sh"
done
OUT=$A/tui COLS=150 ROWS=40 node $D/record-terminal.mjs tui-walkthrough \
  "$SHEP tui --repo $DEMO_DIR/shop --no-notify" $D/tui-steps.json
$SHEP ui --port 4050 --no-open > "$DEMO_DIR/ui.log" 2>&1 &
UI_PID=$!
trap 'kill $UI_PID 2>/dev/null || true' EXIT
until curl -sf http://localhost:4050 > /dev/null; do sleep 1; done
OUT=$A/ui node $D/capture-ui.mjs
