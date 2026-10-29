# Shared helpers for the self-learning demo (spec 150).
# Every scene types real `shep` commands against an isolated SHEP_HOME.
#
#   DEMO_DIR   scratch folder with the demo repository (default /tmp/shep-learn-demo)
#   SHEP       how to call the CLI (default: the built CLI in this checkout)
DEMO_DIR="${DEMO_DIR:-/tmp/shep-learn-demo}"
SHEP="${SHEP:-node dist/src/presentation/cli/index.js}"
REPO="$DEMO_DIR/shop"
STATE="$DEMO_DIR/state.env"
TYPE_DELAY="${TYPE_DELAY:-0.02}"
export FORCE_COLOR=1 DO_NOT_TRACK=1
mkdir -p "$DEMO_DIR" && touch "$STATE"
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
say() { printf '\n\033[2m# %s\033[0m\n' "$1"; sleep 0.6; }

# shep <args…>: type and run a shep command (the repository path is shown as ~/shop)
shep() {
  local shown="shep" arg
  for arg in "$@"; do
    arg="${arg//$REPO/~\/shop}"
    arg="${arg//$DEMO_DIR/~}"
    if [[ "$arg" =~ [[:space:]#] ]]; then shown+=" \"$arg\""; else shown+=" $arg"; fi
  done
  type_line "$shown"
  OUT="$($SHEP "$@" 2>&1)"
  printf '%s\n' "${OUT//$REPO/~/shop}"
  sleep 1.2
}
