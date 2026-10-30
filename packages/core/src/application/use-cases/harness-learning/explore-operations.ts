/**
 * The two primitive operations of Explore mode (spec 150), shared by both
 * recursion schedules: roll a harness out in a fresh probe worktree, and run
 * one improver stage — each recorded in the refinement ledger.
 */

import type {
  HarnessEditDimension,
  HarnessImproverStage,
  HarnessRecursion,
} from '../../../domain/generated/output.js';
import type { HarnessTree } from '../../../domain/harness-learning/harness-tree.js';
import type { RefinementLedger } from '../../../domain/harness-learning/refinement-ledger.js';
import type {
  EvidenceFiles,
  IEvidenceWorkspace,
} from '../../ports/output/services/evidence-workspace.interface.js';
import type { IHarnessImprover } from '../../ports/output/services/harness-improver.interface.js';
import type {
  IProbeWorktreeService,
  ProbeWorktree,
} from '../../ports/output/services/probe-worktree.interface.js';
import type { ExploreContext } from './explore-recursion.js';
import type { IHarnessRolloutRunner, ProbedRollout } from './explore.types.js';
import { runImproverStage } from './run-improver-stage.js';

export class OverBudget extends Error {}

export type RolledProbe = ProbedRollout & { probe: ProbeWorktree };

export interface ExploreOperationsDeps {
  probes: IProbeWorktreeService;
  improver: IHarnessImprover;
  workspace: IEvidenceWorkspace;
  runner: IHarnessRolloutRunner;
  ledger: RefinementLedger;
}

export interface ExploreOperationsInput {
  featureId: string;
  featureWorktree: string;
  baseCommit: string;
  k: number;
  recursion: HarnessRecursion;
  sequential: boolean;
  maxCostUsd: number;
  alwaysOnCharCap: number;
  /** Every rollout is appended here, so the caller can adopt and dispose. */
  rolled: RolledProbe[];
}

export function exploreOperations(
  deps: ExploreOperationsDeps,
  input: ExploreOperationsInput
): Pick<ExploreContext, 'roll' | 'stage' | 'guard'> {
  const roll = async (label: string, tree: HarnessTree): Promise<ProbedRollout> => {
    const probe = await deps.probes.fork(input.featureWorktree, input.baseCommit, label);
    const result = await deps.runner
      .rollout({ label, worktreePath: probe.path, tree })
      .catch((e: unknown) => ({
        text: '',
        costUsd: 0,
        error: e instanceof Error ? e.message : String(e),
      }));
    const outcome = await deps.probes.inspect(probe);
    deps.ledger.rollout(label, result.costUsd);
    const rolled = { label, tree, result, outcome, probe };
    input.rolled.push(rolled);
    return rolled;
  };

  const stage = async (
    label: string,
    files: EvidenceFiles,
    current: HarnessTree,
    kind: HarnessImproverStage,
    index: number,
    dimension?: HarnessEditDimension
  ) => {
    const result = await runImproverStage(
      { improver: deps.improver, workspace: deps.workspace },
      {
        label,
        files,
        current,
        featureId: input.featureId,
        spec: {
          stage: kind,
          ...(dimension ? { dimension } : {}),
          k: input.k,
          index,
          ...(input.sequential ? { sequential: true } : {}),
          alwaysOnCharCap: input.alwaysOnCharCap,
        },
      }
    );
    deps.ledger.session(label, result.costUsd);
    return result;
  };

  const guard = () => {
    if (deps.ledger.isOverBudget(input.maxCostUsd)) throw new OverBudget();
  };

  return { roll, stage, guard };
}
