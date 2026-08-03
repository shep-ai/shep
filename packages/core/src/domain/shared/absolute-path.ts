/**
 * Cross-platform absolute-path predicate.
 *
 * `normalizePath` converts backslashes to forward slashes, so by the time a
 * path reaches a use case a Windows path looks like `C:/Users/dev/project`.
 * A naive `startsWith('/')` check therefore rejects every valid Windows path,
 * which is why this lives in one place rather than being re-derived per caller.
 *
 * Accepts:
 * - POSIX absolute paths: `/home/dev/project`
 * - Windows drive-letter paths (normalized): `C:/Users/dev/project`
 * - UNC paths (normalized): `//server/share/project`
 *
 * This module has zero imports and performs no I/O — a pure function, and so a
 * legitimate inhabitant of `domain/shared/`.
 */

/** Matches a normalized Windows drive-letter root, e.g. `C:/` or `c:/`. */
const WINDOWS_DRIVE_ROOT = /^[a-zA-Z]:\//;

export function isAbsolutePath(path: string | null | undefined): boolean {
  if (path === null || path === undefined || path === '') return false;

  // Normalize separators so callers may pass either form.
  const forwardSlash = path.replace(/\\/g, '/');

  return forwardSlash.startsWith('/') || WINDOWS_DRIVE_ROOT.test(forwardSlash);
}
