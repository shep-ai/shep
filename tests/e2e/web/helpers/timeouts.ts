/**
 * Waits for a web UI served by `next dev`.
 *
 * The e2e suite runs against the dev server, which compiles a route the
 * first time it is requested. On a cold CI runner the first compile of a
 * heavy route (`/settings`) does not fit inside Playwright's default 30s
 * test budget, so the spec that lands on such a route first needs a budget
 * of its own — every later test on the same route runs warm.
 *
 * Prefer waiting for an element over `page.waitForLoadState('networkidle')`:
 * Playwright discourages `networkidle`, and a page that polls may never
 * reach a quiet-network window at all.
 */

/** Per-test budget for a spec that may pay a cold route compile. */
export const COLD_ROUTE_TEST_TIMEOUT_MS = 90_000;

/** Budget for the first element of a cold route to become visible. */
export const COLD_ROUTE_READY_TIMEOUT_MS = 60_000;
