/**
 * Bounded, never-throwing manifest reads.
 *
 * Every ecosystem detector reads its manifest through this helper, which
 * enforces three things the detectors depend on:
 *
 * 1. **Stat before read.** Cheaper than a failed open, and it makes
 *    fall-through deterministic: a detector must not receive some OTHER
 *    file's bytes because it read without first confirming its own manifest
 *    exists.
 * 2. **Size cap.** A generated lockfile can be megabytes; nothing a detector
 *    looks for lives past MAX_MANIFEST_BYTES (NFR-1).
 * 3. **Never throws.** A permission-denied read, a symlink loop or a
 *    directory where a file was expected all return `null`, which every
 *    detector reads as "nothing declared here" and falls through (NFR-4).
 *
 * Output is CRLF-normalised so the line-anchored scans (`^dev:` in a
 * Makefile, `^\[tool.poetry\]` in a pyproject) match on Windows checkouts
 * (NFR-8).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_MANIFEST_BYTES } from '../registry.js';

export { MAX_MANIFEST_BYTES };

/**
 * Find the first of several candidate manifest names that exists in a
 * directory.
 *
 * This is the explicit `existsSync` gate every non-Node detector opens with.
 * It matters for correctness as well as cost: a detector that reads without
 * confirming its OWN manifest is present can be handed some other file's
 * bytes and mistake them for its own.
 *
 * @param dirPath - Directory to look in.
 * @param names - Candidate filenames, in preference order. Segments may use
 *                `/` (e.g. `bin/rails`); they are joined per-platform.
 * @returns Absolute path to the first candidate present, or `null`.
 */
export function findManifest(dirPath: string, names: readonly string[]): string | null {
  for (const name of names) {
    const candidate = join(dirPath, ...name.split('/'));
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // An unreadable parent directory is a fall-through, never a throw.
    }
  }
  return null;
}

/**
 * Read a manifest file as UTF-8, or return `null` for any reason it cannot
 * be read as one.
 *
 * @param filePath - Absolute path to the manifest.
 * @returns CRLF-normalised contents, or `null` when missing, not a regular
 *          file, larger than {@link MAX_MANIFEST_BYTES}, or unreadable.
 */
export function readManifest(filePath: string): string | null {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return null;
    if (stats.size > MAX_MANIFEST_BYTES) return null;

    return readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}
