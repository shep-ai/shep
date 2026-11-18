// The machines Shep 2 ships a binary for, and the npm package that carries each one.
//
// The binary packages are always named `shep2-<os>-<cpu>`, whatever the wrapper is called, so
// the same binaries can sit behind `shep2` today and behind `shep` later (see ../../README.md).
// `target` is the Rust target triple; release tarballs are named `shep-<version>-<target>.tar.gz`.
// Keep this list in step with install.sh, the Homebrew template and shep2-release.yml — the
// consistency test in dist/test fails when they drift.

export const BINARY_NAME = 'shep';
export const BINARY_PACKAGE_PREFIX = 'shep2';

export const PLATFORMS = Object.freeze([
  Object.freeze({ os: 'darwin', cpu: 'arm64', target: 'aarch64-apple-darwin' }),
  Object.freeze({ os: 'darwin', cpu: 'x64', target: 'x86_64-apple-darwin' }),
  Object.freeze({ os: 'linux', cpu: 'x64', target: 'x86_64-unknown-linux-musl' }),
  Object.freeze({ os: 'linux', cpu: 'arm64', target: 'aarch64-unknown-linux-musl' }),
]);

export function packageNameFor(platform) {
  return `${BINARY_PACKAGE_PREFIX}-${platform.os}-${platform.cpu}`;
}

/** The platform entry for a Node `process.platform` / `process.arch` pair, or null. */
export function findPlatform(os, cpu) {
  return PLATFORMS.find((p) => p.os === os && p.cpu === cpu) ?? null;
}

export function describeSupported() {
  return PLATFORMS.map((p) => `${p.os}-${p.cpu}`).join(', ');
}

export function tarballName(version, target) {
  return `${BINARY_NAME}-${version}-${target}.tar.gz`;
}
