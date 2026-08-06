/**
 * Lifecycle gate constants for feature dependency blocking and
 * exploration mode transition validation.
 *
 * Centralises membership checks used by:
 * - CreateFeatureUseCase / CheckAndUnblockFeaturesUseCase (dependency gates)
 * - PromoteExplorationUseCase (exploration mode transitions)
 */

import { SdlcLifecycle } from './generated/output';
import type { Feature } from './generated/output';

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
 * Does a parent feature's progress satisfy the dependency gate for its children?
 *
 * This is the single predicate every dependency decision must use — creating a
 * child, starting a Pending child, reparenting, and auto-unblocking. Comparing
 * against POST_IMPLEMENTATION directly misses the Archived case below.
 *
 * Archived is treated as a filing concern, not a rollback of progress: features
 * are auto-archived a configurable delay after reaching Maintain, so a parent
 * that completed and was then archived MUST still release its children —
 * `previousLifecycle` carries the progress it had when it was archived. A parent
 * archived *before* reaching the gate keeps its children blocked, because its
 * work never landed.
 *
 * @param parent - The parent feature (only its lifecycle fields are read).
 * @returns True when direct children may leave Blocked.
 */
export function satisfiesDependencyGate(
  parent: Pick<Feature, 'lifecycle'> & Partial<Pick<Feature, 'previousLifecycle'>>
): boolean {
  if (parent.lifecycle === SdlcLifecycle.Archived) {
    return (
      parent.previousLifecycle !== undefined && POST_IMPLEMENTATION.has(parent.previousLifecycle)
    );
  }

  return POST_IMPLEMENTATION.has(parent.lifecycle);
}

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
