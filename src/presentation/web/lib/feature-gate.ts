/**
 * The web side of a feature flag (specs 135, 140): what a page, an API route or
 * a server action does while the flag that owns it is off.
 *
 * - pages call `requireFeaturePage()` and 404;
 * - API routes return `featureNotFound()`;
 * - server actions return `{ error: FEATURE_OFF_ERROR }` before doing any work.
 */

import { getFeatureFlags, type FeatureFlagsState } from '@/lib/feature-flags';

/** What a server action answers while its feature flag is off. */
export const FEATURE_OFF_ERROR = 'This feature is turned off in Settings → Feature flags.';

/** True while at least one of `flags` is on. */
export function isFeatureOn(...flags: (keyof FeatureFlagsState)[]): boolean {
  const current = getFeatureFlags();
  return flags.some((flag) => current[flag]);
}

/** What an API route answers while its feature flag is off. */
export function featureNotFound(): Response {
  return Response.json({ error: 'Not found.' }, { status: 404 });
}
