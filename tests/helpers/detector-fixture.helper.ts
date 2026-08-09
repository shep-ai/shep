/**
 * Real-filesystem fixtures for the ecosystem detector suites.
 *
 * Detector tests deliberately use temp directories rather than mocks of
 * `node:fs` (NFR-9): the thing under test IS the parsing of real manifest
 * bytes, and a mocked `readFileSync` would assert only that we called it.
 *
 * `os.tmpdir()` + `mkdtempSync` keeps this cross-platform (never `/tmp`).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Files to materialise, keyed by repo-relative path (may contain `/`). */
export type FixtureFiles = Record<string, string>;

/** Directories to create empty (e.g. `node_modules`, `.venv`). */
export type FixtureDirs = readonly string[];

const createdRoots: string[] = [];

/**
 * Create a temp directory containing the given files and directories.
 *
 * Paths are given with forward slashes and joined per-segment, so the same
 * fixture definition works on win32.
 *
 * @param prefix - Short label used in the temp directory name.
 * @param files - Repo-relative path → file contents.
 * @param dirs - Repo-relative directories to create empty.
 * @returns Absolute path to the fixture root.
 */
export function makeFixture(
  prefix: string,
  files: FixtureFiles = {},
  dirs: FixtureDirs = []
): string {
  const root = mkdtempSync(join(tmpdir(), `shep-${prefix}-`));
  createdRoots.push(root);

  for (const dir of dirs) {
    mkdirSync(join(root, ...dir.split('/')), { recursive: true });
  }

  for (const [relative, contents] of Object.entries(files)) {
    const filePath = join(root, ...relative.split('/'));
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, 'utf-8');
  }

  return root;
}

/** Remove every fixture created so far. Safe to call when none exist. */
export function cleanupFixtures(): void {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Normalise a path for comparison across platforms. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
