/**
 * SdlcLifecycle → agent graph node name mapping (domain shared).
 *
 * Single source of truth used by both the SSE agent-events stream (server)
 * and the client-side feature-state derivation in the web UI. Historically
 * the same table was duplicated in two places (clean-arch violation #7 in
 * spec 089).
 *
 * Pure data — no imports except the generated `SdlcLifecycle` enum.
 */

import { SdlcLifecycle } from '../generated/output';

/**
 * Static mapping from every `SdlcLifecycle` value to the agent graph node
 * name the client uses to derive `FeatureLifecyclePhase` via
 * `mapPhaseNameToLifecycle()`.
 */
export const LIFECYCLE_TO_NODE: Record<SdlcLifecycle, string> = {
  [SdlcLifecycle.Started]: 'requirements',
  [SdlcLifecycle.Analyze]: 'analyze',
  [SdlcLifecycle.Requirements]: 'requirements',
  [SdlcLifecycle.Research]: 'research',
  [SdlcLifecycle.Planning]: 'plan',
  [SdlcLifecycle.Implementation]: 'implement',
  [SdlcLifecycle.Review]: 'merge',
  [SdlcLifecycle.Maintain]: 'maintain',
  [SdlcLifecycle.Blocked]: 'blocked',
  [SdlcLifecycle.Pending]: 'pending',
  [SdlcLifecycle.Deleting]: 'blocked',
  [SdlcLifecycle.AwaitingUpstream]: 'merge',
  [SdlcLifecycle.Archived]: 'archived',
};

/**
 * Resolve the agent graph node name for a given lifecycle, accepting a raw
 * string because several call sites have `feature.lifecycle` typed as `string`
 * (it comes straight from SQLite before enum coercion). Falls back to
 * `fallback` (default `'requirements'`) for unrecognised values.
 */
export function lifecycleToNode(
  lifecycle: SdlcLifecycle | string,
  fallback = 'requirements'
): string {
  return LIFECYCLE_TO_NODE[lifecycle as SdlcLifecycle] ?? fallback;
}
