/**
 * Rust detector — `cargo run`.
 *
 * Deliberately content-independent beyond one question: does this manifest
 * describe a runnable crate? `cargo run` is the canonical invocation whatever
 * the package declares, and cargo builds implicitly, so there is nothing to
 * read out of `Cargo.toml` except the `[package]` header.
 *
 * A virtual workspace manifest (only `[workspace]`) has nothing to run — cargo
 * itself errors there — so it falls through rather than emitting a command
 * that cannot work.
 */

import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';
import { hasTomlTable } from './shared/toml-scan.js';

const CARGO_MANIFEST = 'Cargo.toml';

const log = createDeploymentLogger('[detectRust]');

/**
 * Detect a Rust crate that can be run.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `cargo run`, or a fall-through error for a missing, unreadable or
 *          workspace-only manifest.
 */
export const detectRust: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, [CARGO_MANIFEST]);
  if (manifestPath === null) {
    return { success: false, error: `No Cargo.toml found in ${dirPath}` };
  }

  const contents = readManifest(manifestPath);
  if (contents === null) {
    log.warn(`could not read ${manifestPath} — falling through`);
    return { success: false, error: `Could not read ${manifestPath}` };
  }

  if (!hasTomlTable(contents, 'package')) {
    return {
      success: false,
      error: `Cargo.toml in ${dirPath} declares no [package] to run`,
    };
  }

  log.info(`detected — command="cargo run", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command: 'cargo run',
    // `cargo run` compiles and fetches dependencies itself.
    needsInstall: false,
    resolvedDir: dirPath,
    language: 'Rust',
    runtime: 'cargo',
    setupCommands: [],
  };
};
