/**
 * Shared upstream-request settings for the model catalogs.
 */

/**
 * Longest a catalog request may take before it is abandoned.
 *
 * The catalog is fetched while the model picker waits on it; without a bound,
 * a provider that accepts the connection and never answers hangs the caller
 * indefinitely. On timeout the catalog falls back to its cached (or empty)
 * list, exactly as for any other fetch failure.
 */
export const MODEL_CATALOG_FETCH_TIMEOUT_MS = 10_000;
