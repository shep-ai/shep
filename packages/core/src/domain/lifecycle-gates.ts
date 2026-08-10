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
 * Lifecycle values that mean a feature's work is finished and has landed.
 *
 * Only Maintain qualifies. The merge node is explicit about this: it sets
 * Maintain when the branch actually merged and Review when the PR is still
 * open (`merged ? Maintain : Review`). Every other lifecycle — including
 * Implementation and Review — describes work that can still change, or that
 * may never land at all if the PR is closed.
 *
 * A parent whose lifecycle is a member of this set satisfies Gate 1:
 * directly-blocked children may transition from Blocked to Started.
 */
export const COMPLETED_LIFECYCLES = new Set<SdlcLifecycle>([SdlcLifecycle.Maintain]);

/**
 * Does a parent feature's progress satisfy the dependency gate for its children?
 *
 * This is the single predicate every dependency decision must use — creating a
 * child, starting a Pending child, reparenting, and auto-unblocking. Comparing
 * against COMPLETED_LIFECYCLES directly misses the Archived case below.
 *
 * A child is released only once its parent's work is DONE, because the child
 * rebases onto that work before it starts: releasing early would build the
 * child on commits that are still being rewritten, or on a branch whose PR is
 * never merged.
 *
 * Archived is treated as a filing concern, not a rollback of progress: features
 * are auto-archived a configurable delay after reaching Maintain, so a parent
 * that completed and was then archived MUST still release its children —
 * `previousLifecycle` carries the progress it had when it was archived. A parent
 * archived *before* completing keeps its children blocked, because its work
 * never landed.
 *
 * @param parent - The parent feature (only its lifecycle fields are read).
 * @returns True when direct children may leave Blocked.
 */
export function satisfiesDependencyGate(
  parent: Pick<Feature, 'lifecycle'> & Partial<Pick<Feature, 'previousLifecycle'>>
): boolean {
  if (parent.lifecycle === SdlcLifecycle.Archived) {
    return (
      parent.previousLifecycle !== undefined && COMPLETED_LIFECYCLES.has(parent.previousLifecycle)
    );
  }

  return COMPLETED_LIFECYCLES.has(parent.lifecycle);
}

/**
 * Lifecycles a feature held back by a closed dependency gate may still move to.
 *
 * A Blocked feature is waiting for the work it depends on to land, so nothing
 * may advance it along the SDLC — but filing and teardown are not progress and
 * must stay reachable:
 * - Blocked: the idempotent re-write of the state it is already in.
 * - Deleting: the user removed the feature; the gate does not own its removal.
 * - Archived: the feature was filed away; `previousLifecycle` keeps the truth.
 *
 * Every other target means "start doing work", which is exactly what the gate
 * exists to prevent.
 */
export const GATE_EXEMPT_LIFECYCLES = new Set<SdlcLifecycle>([
  SdlcLifecycle.Blocked,
  SdlcLifecycle.Deleting,
  SdlcLifecycle.Archived,
]);

/**
 * May a Blocked feature be advanced to `target` given its parent's progress?
 *
 * Answers the "don't start before the parent completed" invariant from the
 * *write* side: `satisfiesDependencyGate` decides when a child is released,
 * this decides which writes are allowed while it is not.
 *
 * A feature that is not Blocked is unaffected — it was already released, and
 * re-checking here would fight `CheckAndUnblockFeaturesUseCase`. A Blocked
 * feature whose parent cannot be loaded (deleted, dangling id) is also allowed
 * through: there is no dependency left to honour, and refusing would strand it
 * in Blocked with no transition able to release it.
 *
 * @param feature - The feature being written to (lifecycle + parentId are read).
 * @param parent - The parent feature, or null when it has none / cannot be loaded.
 * @param target - The lifecycle the caller wants to write.
 * @returns True when the write may proceed.
 */
export function allowsLifecycleWrite(
  feature: Pick<Feature, 'lifecycle'> & Partial<Pick<Feature, 'parentId'>>,
  parent: (Pick<Feature, 'lifecycle'> & Partial<Pick<Feature, 'previousLifecycle'>>) | null,
  target: SdlcLifecycle
): boolean {
  if (feature.lifecycle !== SdlcLifecycle.Blocked) {
    return true;
  }
  if (GATE_EXEMPT_LIFECYCLES.has(target)) {
    return true;
  }
  if (!feature.parentId || !parent) {
    return true;
  }

  return satisfiesDependencyGate(parent);
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
