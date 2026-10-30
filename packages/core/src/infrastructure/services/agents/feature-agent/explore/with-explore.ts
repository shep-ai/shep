/**
 * Explore mode around an implement node (spec 150).
 *
 * When the feature explores, the implement step is replaced by a refinement:
 * several attempts under candidate harnesses in probe worktrees, the one kept
 * by blind selection fast-forwarded into the feature worktree. When it does
 * not explore — or the refinement adopted nothing — the wrapped node runs
 * exactly as before.
 */

import type { ExplorePlan } from '@/application/use-cases/harness-learning/resolve-explore-plan.use-case.js';
import type { RefineHarnessResult } from '@/application/use-cases/harness-learning/refine-harness.use-case.js';
import type { FeatureAgentState } from '../state.js';
import { getCompletedPhases, markPhaseComplete } from '../nodes/node-helpers.js';
import { recordPhaseEnd, recordPhaseStart } from '../phase-timing-context.js';

const EXPLORE_PHASE = 'implement:explore';

export interface ExploreNodeDeps {
  plan(featureId: string): Promise<ExplorePlan | null>;
  run(state: FeatureAgentState, plan: ExplorePlan): Promise<RefineHarnessResult>;
  log(message: string): void;
}

type NodeFn = (state: FeatureAgentState) => Promise<Partial<FeatureAgentState>>;

export function withExplore(node: NodeFn, phase: string, explore?: ExploreNodeDeps): NodeFn {
  if (!explore) return node;
  return async (state) => {
    if (getCompletedPhases(state.specDir).includes(phase) || state._needsReexecution) {
      return node(state);
    }
    const plan = await explore.plan(state.featureId).catch(() => null);
    if (!plan) return node(state);

    const started = Date.now();
    const timingId = await recordPhaseStart(EXPLORE_PHASE, {});
    let result: RefineHarnessResult | undefined;
    try {
      result = await explore.run(state, plan);
    } catch (error) {
      explore.log(`[explore] refinement failed: ${String(error)}`);
    }
    await recordPhaseEnd(timingId, Date.now() - started, {
      ...(result ? { costUsd: result.costUsd } : {}),
    });
    if (!result?.adopted) {
      explore.log(`[explore] nothing adopted (${result?.status ?? 'error'}) — running ${phase}`);
      return node(state);
    }
    markPhaseComplete(state.specDir, phase);
    explore.log(`[explore] kept ${result.chosenLabel ?? 'an attempt'} (${result.status})`);
    return {
      currentNode: phase,
      messages: [
        `[${phase}] Explore: kept ${result.chosenLabel ?? 'an attempt'} of ${plan.k * 4} — ${result.status}`,
      ],
      _needsReexecution: false,
    };
  };
}
