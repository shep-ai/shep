#!/bin/sh
# Try Shep 2 before its first release: installs the `shep` CI built for the Shep 2 branch, for
# this machine, and with --app also Shep.app (macOS). Needs the GitHub CLI, signed in.
#
#   gh api -H 'Accept: application/vnd.github.raw' \
#     'repos/shep-ai/shep/contents/shep2/dist/try.sh?ref=claude/magical-heisenberg-fa1drb' | sh -s -- --app
#
# It downloads the newest green build with `gh run download` and installs it with install.sh,
# which checks its SHA-256 and puts it in ~/.local/bin (or $SHEP_INSTALL_DIR). Nothing is
# published anywhere; a released Shep replaces this with `curl -fsSL https://shep.bot/install | sh`.

set -eu

REPO="shep-ai/shep"
BRANCH=${SHEP_TRY_BRANCH:-claude/magical-heisenberg-fa1drb}
BINARIES_WORKFLOW="shep2-release.yml"
APP_WORKFLOW="shep2.yml"
APP_ARTIFACT="shep2-mac-app"
APP_ZIP="Shep-macos.zip"
TAG_PREFIX="shep2-v"

say() {
  printf '%s\n' "$*"
}

die() {
  printf 'shep try: %s\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

# The newest run of <workflow> on the branch that finished green.
green_run() {
  run=$(gh run list -R "$REPO" --workflow "$1" --branch "$BRANCH" --status success --limit 1 \
    --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
  if [ -z "$run" ] || [ "$run" = "null" ]; then
    die "no green build of $1 on $BRANCH yet; try again when CI has passed"
  fi
  printf '%s\n' "$run"
}

install_shep() {
  gh api -H 'Accept: application/vnd.github.raw' \
    "repos/$REPO/contents/shep2/dist/install.sh?ref=$BRANCH" >"$tmp/install.sh" ||
    die "could not fetch install.sh from $BRANCH"
  target=$(sh "$tmp/install.sh" --print-target)
  run=$(green_run "$BINARIES_WORKFLOW")
  say "Downloading shep for $target from CI run $run"
  gh run download "$run" -R "$REPO" -n "shep2-$target" -D "$tmp/download" ||
    die "CI run $run has no build for $target"
  tarball=""
  for file in "$tmp/download"/shep-*-"$target".tar.gz; do
    [ -f "$file" ] && tarball=${file##*/}
  done
  [ -n "$tarball" ] || die "CI run $run built no shep-*-$target.tar.gz"
  version=${tarball#shep-}
  version=${version%-"$target".tar.gz}
  mkdir -p "$tmp/base/$TAG_PREFIX$version"
  mv "$tmp/download/"* "$tmp/base/$TAG_PREFIX$version/"
  SHEP_VERSION=$version SHEP_DOWNLOAD_BASE="file://$tmp/base" sh "$tmp/install.sh"
}

install_app() {
  apps="$HOME/Applications"
  run=$(green_run "$APP_WORKFLOW")
  say "Downloading Shep.app from CI run $run"
  gh run download "$run" -R "$REPO" -n "$APP_ARTIFACT" -D "$tmp/app" ||
    die "CI run $run kept no Shep.app"
  mkdir -p "$apps"
  rm -rf "$apps/Shep.app"
  if has ditto; then
    ditto -x -k "$tmp/app/$APP_ZIP" "$apps"
  else
    unzip -q "$tmp/app/$APP_ZIP" -d "$apps"
  fi
  # Built by CI and signed ad hoc, not by a known developer: let macOS open it.
  if has xattr; then
    xattr -dr com.apple.quarantine "$apps/Shep.app" 2>/dev/null || true
  fi
  say "Installed Shep.app to $apps/Shep.app"
}

main() {
  want_app=""
  for arg in "$@"; do
    case $arg in
      --app) want_app=1 ;;
      *) die "unknown option $arg (use --app for Shep.app)" ;;
    esac
  done
  has gh || die "needs the GitHub CLI (https://cli.github.com), signed in with gh auth login"
  # Ask for what is needed (an API call), not `gh auth status`: that fails when any account
  # gh knows has a bad token, even with github.com signed in.
  gh api user >/dev/null 2>&1 || die "the GitHub CLI cannot reach GitHub; run gh auth login"
  [ -n "${HOME:-}" ] || die "HOME is not set"

  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t shep-try)
  trap 'rm -rf "$tmp"' EXIT
  trap 'exit 1' HUP INT TERM

  install_shep
  if [ -n "$want_app" ]; then
    if [ "$(uname -s)" = "Darwin" ]; then
      install_app
    else
      say "Shep.app is for macOS; skipped it here." >&2
    fi
  fi

  say ""
  say "Shep 2 is installed. cd into a repository and run: shep"
  if [ -n "$want_app" ] && [ "$(uname -s)" = "Darwin" ]; then
    say "The Mac app needs the daemon that shep starts; then: open ~/Applications/Shep.app"
  fi
}

main "$@"
