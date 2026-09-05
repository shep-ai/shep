/**
 * The one predicate that expresses "the user chose this plan".
 *
 * An override exists precisely to overrule the heuristics, so a heuristic
 * that can overrule the override back is not an override. Two places in the
 * graph would otherwise silently discard typed input:
 *
 * - the analyze node's cache tier, which declares a drifted plan stale and
 *   lets the deterministic tier upsert straight over it, and
 * - the remediate node, which deletes the cached plan on the first failure.
 *
 * Both branch on this single predicate rather than on a second orthogonal
 * flag — which is the whole reason `RunPlanSource.Manual` was modelled as a
 * source value instead of a `pinned` column (FR-15).
 *
 * Deliberately NOT enforced inside the run-plan repository: that would hide
 * policy in the persistence adapter and would silently break
 * `InvalidateDevServerRunPlanUseCase`, which must clear a plan regardless of
 * its source (FR-16).
 */

import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';

/**
 * True when the plan was authored by a user — either typed through the
 * override surface or committed as `.shep/dev.json`.
 */
export function isManualPlan(plan: Pick<DevServerRunPlan, 'source'>): boolean {
  return plan.source === RunPlanSource.Manual;
}
