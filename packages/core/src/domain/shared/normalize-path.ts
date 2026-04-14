/**
 * Pure path normalization helper shared across application use cases.
 *
 * The project historically had two local copies of this logic in the
 * repositories use cases with subtly different trailing-slash handling
 * (clean-arch violation #29 in spec 089). Centralising it here guarantees
 * that every caller stores and compares paths using the same canonical form.
 *
 * Rules:
 * 1. Backslashes are converted to forward slashes so Windows paths compare
 *    equal to their POSIX-form siblings (e.g. `C:\\Users\\foo` → `C:/Users/foo`).
 * 2. Trailing slashes are stripped, except when the result would be empty or
 *    the root `/` — keeping the root preserves leading-slash semantics.
 * 3. Input that is empty or nullish collapses to an empty string so callers
 *    get a predictable non-null return.
 *
 * This module has zero imports and performs no I/O — it is a pure function
 * and therefore a legitimate inhabitant of `domain/shared/`.
 */
export function normalizePath(p: string | null | undefined): string {
  if (p === null || p === undefined || p === '') return '';
  const forwardSlash = p.replace(/\\/g, '/');
  // Preserve the root "/" — stripping it would turn an absolute path into an
  // empty string. For every other input, strip any trailing slashes.
  if (forwardSlash === '/') return forwardSlash;
  return forwardSlash.replace(/\/+$/, '');
}
