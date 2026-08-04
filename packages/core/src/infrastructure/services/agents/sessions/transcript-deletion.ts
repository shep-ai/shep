/**
 * Shared transcript-deletion guard.
 *
 * All three real session repositories delete a transcript the same way once the
 * path is known: verify containment, then unlink. The containment check is the
 * security-relevant part — session ids come from filenames on disk, and a
 * malformed or crafted id must not let a delete escape the provider's own root.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Raised when a resolved transcript path lies outside the provider root. */
export class TranscriptOutsideProviderRootError extends Error {
  constructor(
    public readonly resolvedPath: string,
    public readonly providerRoot: string
  ) {
    super(`Refusing to delete "${resolvedPath}": outside provider root "${providerRoot}"`);
    this.name = 'TranscriptOutsideProviderRootError';
  }
}

/**
 * Whether `candidate` sits inside `root`.
 *
 * Compares resolved paths with a trailing separator so `/a/bc` is not treated
 * as living inside `/a/b`.
 */
export function isInsideRoot(candidate: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);

  if (resolvedCandidate === resolvedRoot) return false;
  return resolvedCandidate.startsWith(resolvedRoot + path.sep);
}

/**
 * Delete a transcript file or directory after verifying containment.
 *
 * @returns true when something was removed, false when the target was absent
 * @throws {TranscriptOutsideProviderRootError} when the path escapes the root
 */
export async function deleteTranscriptPath(
  targetPath: string,
  providerRoot: string
): Promise<boolean> {
  if (!isInsideRoot(targetPath, providerRoot)) {
    throw new TranscriptOutsideProviderRootError(targetPath, providerRoot);
  }

  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.unlink(targetPath);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
