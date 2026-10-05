# Shared helpers for the factory demo scenes (specs 120–132).
# Each scene types real `shep` commands against an isolated SHEP_HOME.
#
#   DEMO_DIR   scratch folder with the demo repositories and a stub kubectl
#   SHEP       how to call the CLI (default: the built CLI in this checkout)
#   UI         the running `shep ui` (default http://localhost:4050)

DEMO_DIR="${DEMO_DIR:-/tmp/shep-demo}"
SHEP="${SHEP:-node dist/src/presentation/cli/index.js}"
UI="${UI:-http://localhost:4050}"
STATE="$DEMO_DIR/state.env"
TYPE_DELAY="${TYPE_DELAY:-0.012}"
export FORCE_COLOR=1
touch "$STATE"
# shellcheck disable=SC1090
source "$STATE"

type_line() {
  printf '\033[1;32m$\033[0m '
  local text="$1" i
  for ((i = 0; i < ${#text}; i++)); do
    printf '%s' "${text:i:1}"
    sleep "$TYPE_DELAY"
  done
  printf '\n'
}

# say "text": a comment line in the recording
say() { printf '\n\033[2m# %s\033[0m\n' "$1"; sleep 0.4; }

# shep <args…>: type and run a shep command; its output lands in $OUT
shep() {
  local shown="shep"
  local arg
  for arg in "$@"; do
    if [[ "$arg" =~ [[:space:]#] ]]; then shown+=" \"$arg\""; else shown+=" $arg"; fi
  done
  type_line "$shown"
  OUT="$($SHEP "$@" 2>&1)"
  printf '%s\n' "$OUT"
  sleep 0.6
}

# run "<shell command>": type and run any other command (curl, …)
run() {
  type_line "$1"
  OUT="$(bash -c "$1" 2>&1)"
  printf '%s\n' "$OUT"
  sleep 0.6
}

# show_run "<shown command>" "<real command>": type one command, run another —
# used to keep secrets (the feedback key) off the screen
show_run() {
  type_line "$1"
  OUT="$(bash -c "$2" 2>&1)"
  printf '%s\n' "$OUT"
  sleep 0.6
}

# remember NAME: keep the first id in the last output for later scenes
remember() {
  local id
  id="$(printf '%s' "$OUT" | sed 's/\x1b\[[0-9;]*m//g' | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
  printf '%s=%s\n' "$1" "$id" >> "$STATE"
  printf -v "$1" '%s' "$id"
}
