#!/bin/sh
# Install Shep 2:
#
#   curl -fsSL https://shep.bot/install | sh
#
# Downloads the `shep` binary for this machine (macOS or Linux; arm64 or x86_64) from the
# GitHub release, checks its SHA-256, and puts it in ~/.local/bin. Optional settings:
#
#   SHEP_VERSION=0.1.0          install this version instead of the newest one
#   SHEP_INSTALL_DIR=<dir>      install into <dir> instead of ~/.local/bin
#   SHEP_DOWNLOAD_BASE=<url>    download from a mirror laid out as <url>/shep2-v<version>/<file>
#   SHEP_RELEASES_URL=<url>     look the newest version up here (a GitHub "matching refs" list)
#
# Pass them to sh:  curl -fsSL https://shep.bot/install | SHEP_VERSION=0.1.0 sh
#
# All work happens in main(), called on the last line, so a download cut short runs nothing.

set -eu

REPO="shep-ai/shep"
TAG_PREFIX="shep2-v"
DEFAULT_DOWNLOAD_BASE="https://github.com/$REPO/releases/download"
DEFAULT_RELEASES_URL="https://api.github.com/repos/$REPO/git/matching-refs/tags/$TAG_PREFIX"

say() {
  printf '%s\n' "$*"
}

die() {
  printf 'shep install: %s\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

# fetch <url> <file>
fetch() {
  if has curl; then
    case $1 in
      https://*) curl --proto '=https' --tlsv1.2 -fsSL --retry 3 -o "$2" "$1" ;;
      *) curl -fsSL --retry 3 -o "$2" "$1" ;;
    esac
  elif has wget; then
    wget -q -O "$2" "$1"
  else
    die "need curl or wget to download shep"
  fi
}

sha256_of() {
  if has sha256sum; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif has shasum; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  elif has openssl; then
    openssl dgst -sha256 -r "$1" | cut -d ' ' -f 1
  else
    die "need sha256sum, shasum or openssl to check the download"
  fi
}

# Prints the Rust target triple of the release build for this machine.
detect_target() {
  os=$(uname -s)
  cpu=$(uname -m)
  case $os in
    Darwin) os="apple-darwin" ;;
    Linux) os="unknown-linux-musl" ;;
    MINGW* | MSYS* | CYGWIN* | Windows_NT) die "Shep runs on macOS and Linux. On Windows, run this inside WSL." ;;
    *) die "Shep runs on macOS and Linux, not on $os." ;;
  esac
  case $cpu in
    x86_64 | amd64) cpu="x86_64" ;;
    arm64 | aarch64) cpu="aarch64" ;;
    *) die "Shep is built for arm64 and x86_64, not for $cpu." ;;
  esac
  # A shell running under Rosetta reports x86_64 on Apple silicon; install the native build.
  if [ "$os" = "apple-darwin" ] && [ "$cpu" = "x86_64" ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]; then
    cpu="aarch64"
  fi
  printf '%s-%s\n' "$cpu" "$os"
}

# Prints the newest stable Shep 2 version (tags shep2-vX.Y.Z; Shep 1's v* tags are not listed).
latest_version() {
  list="$tmp/releases.json"
  fetch "$releases_url" "$list" ||
    die "could not look up the newest version at $releases_url. Set SHEP_VERSION to pick one."
  newest=$(tr ',' '\n' <"$list" |
    sed -n "s#.*\"ref\"[[:space:]]*:[[:space:]]*\"refs/tags/$TAG_PREFIX\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)\".*#\1#p" |
    sort -t . -k 1,1n -k 2,2n -k 3,3n | tail -n 1)
  [ -n "$newest" ] || die "found no Shep 2 release at $releases_url. Set SHEP_VERSION to pick one."
  printf '%s\n' "$newest"
}

path_hint() {
  case ":${PATH:-}:" in
    *":$dir:"*)
      first=$(command -v shep 2>/dev/null || true)
      if [ -n "$first" ] && [ "$first" != "$dir/shep" ]; then
        say ""
        say "Note: $first comes first on your PATH, so \`shep\` runs that one."
        say "If it is Shep 1, remove it with: npm uninstall -g @shepai/cli"
      fi
      say ""
      say "Run \`shep\` in a repository to start."
      ;;
    *)
      line="export PATH=\"$dir:\$PATH\""
      case $(basename "${SHELL:-sh}") in
        zsh) rc="$HOME/.zshrc" ;;
        bash) if [ "$(uname -s)" = "Darwin" ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
        fish)
          rc="$HOME/.config/fish/config.fish"
          line="fish_add_path $dir"
          ;;
        *) rc="$HOME/.profile" ;;
      esac
      say ""
      say "$dir is not on your PATH yet. Add it with:"
      say ""
      say "  echo '$line' >> $rc"
      say ""
      say "then open a new terminal and run \`shep\` in a repository."
      ;;
  esac
}

main() {
  base=${SHEP_DOWNLOAD_BASE:-$DEFAULT_DOWNLOAD_BASE}
  base=${base%/}
  releases_url=${SHEP_RELEASES_URL:-$DEFAULT_RELEASES_URL}
  if [ -n "${SHEP_INSTALL_DIR:-}" ]; then
    dir=$SHEP_INSTALL_DIR
  elif [ -n "${HOME:-}" ]; then
    dir="$HOME/.local/bin"
  else
    die "HOME is not set. Set SHEP_INSTALL_DIR to choose where shep goes."
  fi
  case $dir in
    /*) ;;
    *) dir="$(pwd)/$dir" ;;
  esac
  dir=${dir%/}

  target=$(detect_target)
  has tar || die "need tar to unpack shep"

  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t shep-install)
  trap 'rm -rf "$tmp"' EXIT
  trap 'exit 1' HUP INT TERM

  if [ -n "${SHEP_VERSION:-}" ]; then
    version=${SHEP_VERSION#"$TAG_PREFIX"}
    version=${version#v}
  else
    version=$(latest_version)
  fi

  name="shep-$version-$target"
  url="$base/$TAG_PREFIX$version/$name.tar.gz"
  say "Installing shep $version for $target"

  fetch "$url" "$tmp/$name.tar.gz" || die "could not download $url"
  fetch "$url.sha256" "$tmp/$name.tar.gz.sha256" || die "could not download $url.sha256"

  expected=$(cut -d ' ' -f 1 <"$tmp/$name.tar.gz.sha256" | tr 'A-F' 'a-f')
  actual=$(sha256_of "$tmp/$name.tar.gz")
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    die "checksum mismatch for $name.tar.gz (expected ${expected:-nothing}, got $actual). Nothing was installed."
  fi

  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  [ -f "$tmp/$name/shep" ] || die "$name.tar.gz does not contain $name/shep"

  mkdir -p "$dir" 2>/dev/null || die "could not create $dir. Set SHEP_INSTALL_DIR to a directory you can write to."
  [ -w "$dir" ] || die "cannot write to $dir. Set SHEP_INSTALL_DIR to a directory you can write to."
  # Copy next to the destination, then rename: replacing a running shep never leaves half a file.
  cp "$tmp/$name/shep" "$dir/.shep.$$"
  chmod 755 "$dir/.shep.$$"
  mv -f "$dir/.shep.$$" "$dir/shep"

  installed=$("$dir/shep" --version 2>/dev/null) ||
    die "installed $dir/shep, but it does not run on this machine"
  say "Installed $installed to $dir/shep"
  path_hint
}

main "$@"
