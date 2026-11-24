#!/bin/sh
# Packages one `shep` binary exactly as the Shep 2 release publishes it:
#
#   <out-dir>/shep-<version>-<target>.tar.gz         holding shep-<version>-<target>/{shep,LICENSE}
#   <out-dir>/shep-<version>-<target>.tar.gz.sha256  "<sha256>  <file name>", as sha256sum writes it
#
# Usage: package.sh <version> <target> <binary> <out-dir>
# Used by .github/workflows/shep2-release.yml and by dry-run.sh.
set -eu

die() {
  printf 'package.sh: %s\n' "$*" >&2
  exit 1
}

sha256_line() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1"
  else
    die "need sha256sum or shasum"
  fi
}

[ "$#" -eq 4 ] || die "usage: package.sh <version> <target> <binary> <out-dir>"
version=$1
target=$2
binary=$3
out=$4

case $version in
  '' | */* | *' '*) die "bad version: '$version'" ;;
esac
case $target in
  '' | */* | *' '*) die "bad target: '$target'" ;;
esac
[ -f "$binary" ] || die "no binary at $binary"

here=$(cd "$(dirname "$0")" && pwd)
license="$here/../../LICENSE"
[ -f "$license" ] || die "no LICENSE at $license"

name="shep-$version-$target"
stage=$(mktemp -d 2>/dev/null || mktemp -d -t shep-package)
trap 'rm -rf "$stage"' EXIT
trap 'exit 1' INT TERM

mkdir -p "$stage/$name" "$out"
out=$(cd "$out" && pwd)
cp "$binary" "$stage/$name/shep"
cp "$license" "$stage/$name/LICENSE"
chmod 755 "$stage/$name/shep"
chmod 644 "$stage/$name/LICENSE"

# COPYFILE_DISABLE keeps macOS tar from adding ._* metadata files.
COPYFILE_DISABLE=1 tar -czf "$out/$name.tar.gz" -C "$stage" "$name"
(cd "$out" && sha256_line "$name.tar.gz" >"$name.tar.gz.sha256")

printf '%s\n' "$out/$name.tar.gz"
