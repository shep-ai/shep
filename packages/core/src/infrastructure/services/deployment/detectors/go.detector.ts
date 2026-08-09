/**
 * Go detector — `go run .` for a module with a main package.
 *
 * `go.mod` alone is not enough: a module that is a library has no main
 * package, and `go run .` there fails with "no Go files in ...". So the
 * detector confirms an actual entry point — either at the module root or
 * under the conventional `cmd/<name>` layout — and falls through otherwise
 * rather than emitting a command that cannot work.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';

const GO_MANIFEST = 'go.mod';

/** Conventional directory holding one runnable package per subdirectory. */
const CMD_DIR = 'cmd';

/** `package main` on its own line — the only marker of a runnable package. */
const MAIN_PACKAGE = /^package\s+main\b/m;

/**
 * Upper bound on the `.go` files inspected per directory.
 *
 * A generated package can hold hundreds of files; the package clause is the
 * same in all of them, so reading past this point buys nothing (NFR-1).
 */
const MAX_SCANNED_GO_FILES = 40;

/** Upper bound on the `cmd/` subdirectories inspected. */
const MAX_SCANNED_CMD_DIRS = 20;

const log = createDeploymentLogger('[detectGo]');

/**
 * Detect a runnable Go module.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `go run .` or `go run ./cmd/<name>`, or a fall-through error.
 */
export const detectGo: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, [GO_MANIFEST]);
  if (manifestPath === null) {
    return { success: false, error: `No go.mod found in ${dirPath}` };
  }

  if (readManifest(manifestPath) === null) {
    log.warn(`could not read ${manifestPath} — falling through`);
    return { success: false, error: `Could not read ${manifestPath}` };
  }

  const packagePath = findMainPackage(dirPath);
  if (packagePath === null) {
    return {
      success: false,
      error: `go.mod in ${dirPath} declares no main package to run`,
    };
  }

  const command = `go run ${packagePath}`;
  log.info(`detected — command="${command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command,
    // `go run` resolves the module cache itself; `go mod download` below only
    // warms it, so nothing is missing before the first start.
    needsInstall: false,
    resolvedDir: dirPath,
    language: 'Go',
    runtime: 'go',
    setupCommands: ['go mod download'],
  };
};

/**
 * Find the import path of a runnable package, root first then `cmd/<name>`.
 *
 * @returns A `go run` argument (`.` or `./cmd/<name>`), or `null`.
 */
function findMainPackage(dirPath: string): string | null {
  if (hasMainPackage(dirPath)) return '.';

  const cmdPath = join(dirPath, CMD_DIR);
  for (const entry of listEntries(cmdPath).slice(0, MAX_SCANNED_CMD_DIRS)) {
    const candidate = join(cmdPath, entry);
    if (!isDirectory(candidate)) continue;
    // Go import paths are always slash-separated, on every platform.
    if (hasMainPackage(candidate)) return `./${CMD_DIR}/${entry}`;
  }

  return null;
}

/** True when any `.go` file in the directory declares `package main`. */
function hasMainPackage(dirPath: string): boolean {
  const goFiles = listEntries(dirPath)
    .filter((entry) => entry.endsWith('.go') && !entry.endsWith('_test.go'))
    .slice(0, MAX_SCANNED_GO_FILES);

  for (const file of goFiles) {
    const contents = readManifest(join(dirPath, file));
    if (contents !== null && MAIN_PACKAGE.test(contents)) return true;
  }

  return false;
}

/** Directory listing that degrades to empty rather than throwing (NFR-4). */
function listEntries(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

/** Directory check that degrades to false rather than throwing. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
