/**
 * Cross-bundle error matching helpers.
 *
 * The Next.js web routes resolve use cases from `globalThis.__shepContainer`,
 * which was bootstrapped by the CLI / dev-server (tsx-evaluated module graph).
 * Route handlers themselves are bundled by next/turbopack — a SEPARATE module
 * graph. The two graphs hold two different class identities for the same
 * domain error class, so `instanceof DomainError` always returns false on the
 * route side. The fix: every domain error in this repo carries a stable
 * `readonly code: string` field, and routes match on that field instead.
 *
 * Always use these helpers from web routes. NEVER use `instanceof` on a
 * domain error inside a route handler.
 */

/**
 * Read the `code` field from an unknown caught error. Returns null if the
 * error isn't an object or doesn't carry a `code` string.
 */
export function errorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/**
 * Read a string field off an unknown caught error. Used for surfacing
 * structured payload fields like ownerLogin / repoName from a
 * GH_REPO_NAME_TAKEN error to the client.
 */
export function errorField(err: unknown, key: string): string | undefined {
  if (err && typeof err === 'object' && key in err) {
    const value = (err as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/**
 * Get the user-facing message off an unknown caught error.
 */
export function errorMessage(err: unknown, fallback = 'Internal server error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
