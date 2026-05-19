/**
 * Pure-domain path-glob helpers for ASPM ownership resolution
 * (feature 098, phase 2).
 *
 * Supports a deliberately small subset of glob syntax — what teams actually
 * use in CODEOWNERS / .shep/ownership.yaml:
 *
 *   - `**`         — match any number of path segments (including zero)
 *   - `*`          — match any sequence of characters except `/`
 *   - everything else is treated literally
 *
 * Globs are interpreted relative to the repo root. Inputs MUST already be
 * POSIX-normalized — the resolver does the normalization before calling in
 * (NFR-11).
 */

const DOUBLE_STAR = '___DOUBLE_STAR___';
const SINGLE_STAR = '___SINGLE_STAR___';

function escapeRegex(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function compileGlob(glob: string): RegExp {
  const withTokens = glob.replace(/\*\*/g, DOUBLE_STAR).replace(/\*/g, SINGLE_STAR);
  const escaped = escapeRegex(withTokens);
  const pattern = escaped
    .replace(new RegExp(DOUBLE_STAR, 'g'), '.*')
    .replace(new RegExp(SINGLE_STAR, 'g'), '[^/]*');
  return new RegExp(`^${pattern}$`);
}

/**
 * Returns true if `assetPath` matches `glob`. Inputs must use POSIX
 * separators; callers normalize before invoking.
 */
export function matchPathGlob(glob: string, assetPath: string): boolean {
  return compileGlob(glob).test(assetPath);
}

/**
 * Specificity score for ranking globs that match the same path. Higher =
 * more specific. The score is the length of the non-wildcard portion of
 * the glob — a literal segment contributes its length, `*` and `**`
 * contribute zero.
 *
 * Pure, deterministic, easy to reason about. Sufficient for the small set
 * of glob shapes ownership.yaml files use in practice.
 */
export function globSpecificity(glob: string): number {
  return glob.replace(/\*+/g, '').length;
}
