#!/bin/sh
# Prints the Shep 2 version: [workspace.package] version in shep2/Cargo.toml, which every crate
# (and so `shep --version`) inherits. Release tags are shep2-v<this>.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
version=$(awk '
  /^\[/ { in_section = ($0 == "[workspace.package]") }
  in_section && /^version[[:space:]]*=/ { sub(/^[^"]*"/, ""); sub(/".*$/, ""); print; exit }
' "$here/../Cargo.toml")
[ -n "$version" ] || {
  echo "version.sh: no [workspace.package] version in shep2/Cargo.toml" >&2
  exit 1
}
printf '%s\n' "$version"
