/**
 * Lifecycle gate constants for feature dependency blocking and
 * exploration mode transition validation.
 *
 * Centralises membership checks used by:
 * - CreateFeatureUseCase / CheckAndUnblockFeaturesUseCase (dependency gates)
 * - PromoteExplorationUseCase (exploration mode transitions)
 */

import { SdlcLifecycle } from './generated/output';

/**
 * Lifecycle values at or beyond the Implementation gate.
 *
 * A parent whose lifecycle is a member of this set satisfies Gate 1:
 * directly-blocked children may transition from Blocked to Started.
 *
 * Note: Pending and Exploring are intentionally excluded — pending features
 * are user-deferred and exploring features are in prototyping mode; neither
 * can unblock child features.
 */
export const POST_IMPLEMENTATION = new Set<SdlcLifecycle>([
  SdlcLifecycle.Implementation,
  SdlcLifecycle.Review,
  SdlcLifecycle.Maintain,
]);

/**
 * Valid lifecycle transitions FROM the Exploring state.
 *
 * An exploration feature may transition to:
 * - Implementation: promote to Fast mode (skip SDLC, keep prototype code)
 * - Requirements: promote to Regular mode (full SDLC from requirements phase)
 * - Deleting: discard the exploration and clean up worktree/branch
 *
 * The self-loop (Exploring -> Exploring) for feedback iterations is implicit —
 * the lifecycle stays Exploring during iterations, so no transition occurs.
 * Exploring has no approval gates since exploration bypasses SDLC.
 */
export const EXPLORING_TRANSITIONS = new Set<SdlcLifecycle>([
  SdlcLifecycle.Implementation,
  SdlcLifecycle.Requirements,
  SdlcLifecycle.Deleting,
]);
