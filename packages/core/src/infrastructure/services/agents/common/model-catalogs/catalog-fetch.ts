/**
 * Shared upstream-request settings for the model catalogs.
 *
 * ## Caching
 *
 * Every catalog uses an **in-process TTL cache** ({@link MODEL_CATALOG_TTL_MS} = 1h):
 * - Hit while fresh (same auth cache key) → no HTTP/CLI call.
 * - Miss / expiry → fetch; on failure or empty response return last-good for
 *   that same key only (do not extend TTL), else `[]`.
 * - Concurrent callers for the same key share one in-flight fetch (singleflight).
 * - Returned arrays are shallow copies so callers cannot mutate the cache.
 * - Token-backed providers (Together AI, OpenRouter) key by `authConfig.token`.
 * - Claude Code tries the Anthropic Models API, then the `claude` CLI aliases,
 *   then the hardcoded list (see `claude-code-model-catalog.service.ts`).
 *
 * Boot also calls {@link IAgentExecutorFactory.warmModelCatalogs} from the web
 * serve/ui path so the first picker open usually hits a warm cache. Discovery is
 * still never run on every agent turn — only via `listAvailableModels` / warm.
 *
 * Not yet implemented (candidates for a follow-up):
 * - Persist last-good snapshot under `~/.shep/` so cold starts stay offline-friendly.
 * - Per-agent TTL overrides (CLI discovery is slower than HTTP).
 */

/** Longest a catalog request may take before it is abandoned. */
export const MODEL_CATALOG_FETCH_TIMEOUT_MS = 10_000;

/** In-process cache lifetime shared by all {@link TtlModelCatalog} providers. */
export const MODEL_CATALOG_TTL_MS = 60 * 60 * 1000;
