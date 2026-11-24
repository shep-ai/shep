#!/bin/sh
# Release dry run for this machine. Publishes nothing and touches nothing outside a temp dir.
#
#   sh shep2/dist/dry-run.sh                     build with cargo, then check every install path
#   sh shep2/dist/dry-run.sh --artifacts <dir>   check release tarballs built elsewhere (CI)
#   add --keep to leave the temp dir behind for a look
#
# Steps:
#   1. build `shep` for this machine's release target (Linux: static musl) and package it with
#      package.sh, exactly as .github/workflows/shep2-release.yml does
#   2. install it with install.sh from a local copy of the release (file://), into the temp dir
#   3. stage the npm packages with npm/stage.mjs, `npm pack` them, install them offline into a
#      temp project and run the `shep` launcher npm links
#   4. render the Homebrew formula (when tarballs for all four targets are present)
#   5. check each installed `shep` prints the same --help as the packaged binary, lists the
#      commands below, and passes an error exit code through
#
# Needs: sh, tar, node >= 18, npm; for step 1 also cargo and the target's Rust std (on Linux:
# `rustup target add <arch>-unknown-linux-musl` in shep2/ and musl-gcc from musl-tools).
set -eu

# The commands `shep --help` must list. Bare `shep` (the board) is the fourth core action; this
# mirrors help_lists_exactly_the_four_commands in crates/shep-cli/tests.
EXPECTED_COMMANDS="add go config"
BOARD_HINT="Run \`shep\` with no command to see the board."

dist=$(cd "$(dirname "$0")" && pwd)
workspace=$(cd "$dist/.." && pwd)
artifacts=""
keep=0

die() {
  printf 'dry-run: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '\n== %s\n' "$*"
}

while [ "$#" -gt 0 ]; do
  case $1 in
    --artifacts)
      [ "$#" -ge 2 ] || die "--artifacts needs a directory"
      artifacts=$(cd "$2" && pwd)
      shift 2
      ;;
    --keep)
      keep=1
      shift
      ;;
    -h | --help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) die "unknown option $1 (try --help)" ;;
  esac
done

command -v node >/dev/null 2>&1 || die "needs node"
command -v npm >/dev/null 2>&1 || die "needs npm"

version=$(sh "$dist/version.sh")
target=$(node --input-type=module -e "
  import { findPlatform } from '$dist/npm/shep2/lib/platforms.mjs';
  const p = findPlatform(process.platform, process.arch);
  if (!p) { process.stderr.write('no release target for ' + process.platform + '-' + process.arch + '\n'); process.exit(1); }
  process.stdout.write(p.target);
")
tarball="shep-$version-$target.tar.gz"

work=$(mktemp -d 2>/dev/null || mktemp -d -t shep-dry-run)
if [ "$keep" = 1 ]; then
  trap 'printf "\nKept %s\n" "$work"' EXIT
else
  trap 'rm -rf "$work"' EXIT
fi
trap 'exit 1' HUP INT TERM
release="$work/release/shep2-v$version"
mkdir -p "$release"

printf 'Shep %s, target %s\nWork dir: %s\n' "$version" "$target" "$work"

# 1. Build and package (or take the tarballs given).
if [ -n "$artifacts" ]; then
  step "Using release tarballs from $artifacts"
  found=0
  for file in "$artifacts"/shep-"$version"-*.tar.gz; do
    [ -f "$file" ] || continue
    cp "$file" "$file.sha256" "$release/"
    found=$((found + 1))
  done
  [ "$found" -gt 0 ] || die "no shep-$version-*.tar.gz in $artifacts"
else
  step "Building shep for $target"
  command -v cargo >/dev/null 2>&1 || die "needs cargo (or pass --artifacts)"
  if command -v rustup >/dev/null 2>&1 &&
    ! (cd "$workspace" && rustup target list --installed) | grep -qx "$target"; then
    die "the Rust std for $target is missing. Run: (cd shep2 && rustup target add $target)"
  fi
  case $target in
    *-linux-musl)
      command -v musl-gcc >/dev/null 2>&1 ||
        die "building $target needs musl-gcc (Debian/Ubuntu: apt-get install musl-tools)"
      ;;
  esac
  (cd "$workspace" &&
    CARGO_PROFILE_RELEASE_STRIP=symbols cargo build --release --locked -p shep-cli --target "$target")
  step "Packaging"
  sh "$dist/package.sh" "$version" "$target" "$workspace/target/$target/release/shep" "$release"
fi
[ -f "$release/$tarball" ] || die "no $tarball for this machine"
mkdir -p "$work/packaged"
tar -xzf "$release/$tarball" -C "$work/packaged"
packaged="$work/packaged/shep-$version-$target/shep"

# 2. curl installer, from a local copy of the release.
step "install.sh"
SHEP_VERSION="$version" SHEP_DOWNLOAD_BASE="file://$work/release" SHEP_INSTALL_DIR="$work/curl/bin" \
  sh "$dist/install.sh"
curl_shep="$work/curl/bin/shep"

# 3. npm wrapper and binary packages.
step "npm packages"
node "$dist/npm/stage.mjs" --version "$version" --artifacts "$release" --out "$work/npm" --allow-missing
mkdir -p "$work/npm-packs" "$work/npm-project"
host_package=$(node --input-type=module -e "
  import { findPlatform, packageNameFor } from '$dist/npm/shep2/lib/platforms.mjs';
  process.stdout.write(packageNameFor(findPlatform(process.platform, process.arch)));
")
export npm_config_cache="$work/npm-cache"
(cd "$work/npm-packs" && npm pack --silent "$work/npm/shep2" "$work/npm/$host_package" >/dev/null)
(cd "$work/npm-project" &&
  printf '{ "name": "shep-dry-run", "private": true }\n' >package.json &&
  npm install --offline --no-audit --no-fund --loglevel=error \
    "$work/npm-packs/shep2-$version.tgz" "$work/npm-packs/$host_package-$version.tgz")
npm_shep="$work/npm-project/node_modules/.bin/shep"
printf 'npm linked %s\n' "$npm_shep"

# 4. Homebrew formula.
step "Homebrew formula"
if node "$dist/homebrew/render-formula.mjs" --version "$version" --checksums "$release" \
  --base-url "file://$release" --out "$work/shep.rb" 2>"$work/render.err"; then
  printf 'Rendered %s\n' "$work/shep.rb"
  if command -v ruby >/dev/null 2>&1; then
    ruby -c "$work/shep.rb"
  fi
else
  printf 'Skipped: %s\n(CI renders it from all four targets and installs it on macOS.)\n' \
    "$(cat "$work/render.err")"
fi

# 5. Every install path runs the same binary.
step "Checking shep --help from each install path"
"$packaged" --help >"$work/help.expected"
commands=$(awk '/^Commands:/ { on = 1; next } on && NF == 0 { exit } on { print $1 }' \
  "$work/help.expected" | tr '\n' ' ' | sed 's/ $//')
[ "$commands" = "$EXPECTED_COMMANDS" ] ||
  die "shep --help lists '$commands', expected '$EXPECTED_COMMANDS'"
grep -qF "$BOARD_HINT" "$work/help.expected" || die "shep --help lacks: $BOARD_HINT"
printf 'packaged binary lists: %s (+ bare shep for the board)\n' "$commands"

"$packaged" --no-such-flag >/dev/null 2>&1 && expected_status=0 || expected_status=$?
for path in "$curl_shep" "$npm_shep"; do
  "$path" --help >"$work/help.actual"
  cmp -s "$work/help.expected" "$work/help.actual" || {
    diff "$work/help.expected" "$work/help.actual" >&2 || true
    die "$path prints a different --help"
  }
  "$path" --no-such-flag >/dev/null 2>&1 && status=0 || status=$?
  [ "$status" = "$expected_status" ] ||
    die "$path exited $status on a bad flag; the binary exits $expected_status"
  printf 'ok  %s  (%s; bad flag exits %s)\n' "$path" "$("$path" --version)" "$status"
done

step "Dry run passed: tarball, install.sh and npm all give a working shep $version"
