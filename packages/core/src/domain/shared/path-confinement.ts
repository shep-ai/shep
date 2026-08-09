/**
 * Subtree confinement for filesystem paths.
 *
 * Two places decide whether a directory is allowed to be a dev server's `cwd`:
 * the `.shep/dev.json` reader in infrastructure and
 * `OverrideDevServerRunPlanUseCase` in the application layer. Both must answer
 * identically, and the separator in the prefix check is load-bearing — a bare
 * `startsWith` accepts `/repo-evil` for a root of `/repo`, which is a real
 * escape (NFR-6). One implementation, one place to get it right.
 *
 * Windows paths are case-insensitive, so comparing raw would let `C:/Repo`
 * read as an escape from `C:/repo`.
 *
 * Pure functions, zero imports, no I/O — a legitimate inhabitant of
 * `domain/shared/`. Callers that need symlinks resolved must canonicalize
 * before calling; that is I/O and belongs in infrastructure.
 */

/** Comparable form of a path: forward slashes, and lower-cased on win32. */
export function toComparablePath(path: string): string {
  const forwardSlash = path.replace(/\\/g, '/');
  return process.platform === 'win32' ? forwardSlash.toLowerCase() : forwardSlash;
}

/**
 * True when `child` is `root` itself or sits beneath it.
 *
 * Both arguments are normalized before comparison, so callers may pass either
 * separator form. Trailing slashes on `root` are tolerated.
 */
export function isPathInside(root: string, child: string): boolean {
  const normalizedRoot = stripTrailingSlashes(toComparablePath(root));
  const normalizedChild = stripTrailingSlashes(toComparablePath(child));

  if (normalizedRoot === '') return false;
  // The filesystem root is its own prefix — `/` + `/` would never match.
  if (normalizedRoot === '/') return normalizedChild.startsWith('/');
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}/`);
}

/** Drop trailing slashes, preserving a bare root (`/`). */
function stripTrailingSlashes(path: string): string {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
}
