/**
 * The two task-level recursion schedules of Explore mode (spec 150), ported
 * from Harness² `run_parallel` / `run_sequential` (google-research/harness2,
 * Apache-2.0). Both spend exactly 2k proposals, k compositions and 3k
 * rollouts after the k shared base rollouts.
 */

import { HarnessEditDimension, HarnessImproverStage } from '../../../domain/generated/output.js';
import type { HarnessTree } from '../../../domain/harness-learning/harness-tree.js';
import type { EvidenceFiles } from '../../ports/output/services/evidence-workspace.interface.js';
import { renderProbeRun, type ProbedRollout } from './explore.types.js';
import { mapLimit } from './map-limit.js';
import { poolFiles } from './refinement-records.js';
import type { StageResult } from './run-improver-stage.js';

/** Most probes or improver sessions in flight at once. */
export const PHASE_WIDTH = 4;

export interface ExploreContext {
  k: number;
  evidence: EvidenceFiles;
  bases: readonly ProbedRollout[];
  baseTree: HarnessTree;
  roll(label: string, tree: HarnessTree): Promise<ProbedRollout>;
  stage(
    label: string,
    files: EvidenceFiles,
    current: HarnessTree,
    stage: HarnessImproverStage,
    index: number,
    dimension?: HarnessEditDimension
  ): Promise<StageResult>;
  /** Throws when the cost cap is reached. */
  guard(): void;
}

export interface RecursionResult {
  stages: StageResult[];
  finals: ProbedRollout[];
}

export function runFiles(rollouts: readonly ProbedRollout[]): EvidenceFiles {
  return Object.fromEntries(rollouts.map((r) => [`pool/${r.label}/run.md`, renderProbeRun(r)]));
}

function poolWithRuns(
  stages: readonly StageResult[],
  rollouts: readonly ProbedRollout[]
): EvidenceFiles {
  return poolFiles(stages, Object.fromEntries(rollouts.map((r) => [r.label, renderProbeRun(r)])));
}

const proposals = (round: number) =>
  [
    [`inv${round}`, HarnessEditDimension.Inv],
    [`dom${round}`, HarnessEditDimension.Dom],
  ] as const;

/** WIDTH: 2k candidates from shared evidence, then k independent compositions. */
export async function parallelRecursion(ctx: ExploreContext): Promise<RecursionResult> {
  const specs = Array.from({ length: ctx.k }, (_, i) =>
    proposals(i + 1).map(([label, dim]) => ({ label, dim, index: i + 1 }))
  ).flat();
  const proposed = await mapLimit(specs, PHASE_WIDTH, (s) =>
    ctx.stage(
      s.label,
      { ...ctx.evidence, ...runFiles(ctx.bases) },
      ctx.baseTree,
      HarnessImproverStage.Propose,
      s.index,
      s.dim
    )
  );
  ctx.guard();
  const probed = await mapLimit(proposed, PHASE_WIDTH, (p) => ctx.roll(p.label, p.tree));
  ctx.guard();
  const pool = {
    ...ctx.evidence,
    ...runFiles(ctx.bases),
    ...poolWithRuns(proposed, probed),
  };
  const composed = await mapLimit(
    Array.from({ length: ctx.k }, (_, i) => i + 1),
    PHASE_WIDTH,
    (i) => ctx.stage(`agg${i}`, pool, ctx.baseTree, HarnessImproverStage.Compose, i)
  );
  ctx.guard();
  const finals = await mapLimit(composed, PHASE_WIDTH, (c) => ctx.roll(c.label, c.tree));
  return { stages: [...proposed, ...composed], finals };
}

/** DEPTH: k rounds, each editing the previous checkpoint over the whole history. */
export async function sequentialRecursion(ctx: ExploreContext): Promise<RecursionResult> {
  let current = ctx.baseTree;
  const stages: StageResult[] = [];
  const history: ProbedRollout[] = [];
  const finals: ProbedRollout[] = [];
  for (let t = 1; t <= ctx.k; t++) {
    const files = { ...ctx.evidence, ...runFiles(ctx.bases), ...poolWithRuns(stages, history) };
    const round = await mapLimit(proposals(t), 2, ([label, dim]) =>
      ctx.stage(label, files, current, HarnessImproverStage.Propose, t, dim)
    );
    stages.push(...round);
    ctx.guard();
    history.push(...(await mapLimit(round, 2, (p) => ctx.roll(p.label, p.tree))));
    ctx.guard();
    const checkpoint = await ctx.stage(
      `c${t}`,
      { ...ctx.evidence, ...runFiles(ctx.bases), ...poolWithRuns(stages, history) },
      current,
      HarnessImproverStage.Compose,
      t
    );
    stages.push(checkpoint);
    ctx.guard();
    const final = await ctx.roll(checkpoint.label, checkpoint.tree);
    history.push(final);
    finals.push(final);
    current = checkpoint.tree;
    if (t < ctx.k) ctx.guard();
  }
  return { stages, finals };
}
