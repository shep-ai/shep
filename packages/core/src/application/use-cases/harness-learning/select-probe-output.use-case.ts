/**
 * SelectProbeOutputUseCase (spec 150 — Explore mode)
 *
 * Blind selection among the final rollouts: candidates that delivered nothing
 * are dropped, the rest get seeded anonymous ids, and the selector sees only
 * the request, each candidate's diff and its check results — never which
 * harness produced it. A malformed reply never picks silently: the fallback
 * (passing checks first) is used and recorded. One candidate needs no
 * selector. Adapted from Harness² `core/selection.py` (Apache-2.0).
 */

import { inject, injectable } from 'tsyringe';
import { HarnessImproverStage } from '../../../domain/generated/output.js';
import { assignAnonymousIds } from '../../../domain/harness-learning/anonymize-candidates.js';
import { parseChoice } from '../../../domain/harness-learning/improver-reply-parsers.js';
import type {
  EvidenceFiles,
  IEvidenceWorkspace,
} from '../../ports/output/services/evidence-workspace.interface.js';
import {
  ImproverError,
  type IHarnessImprover,
} from '../../ports/output/services/harness-improver.interface.js';
import { assertEvidenceAllowed } from './evidence-render.js';
import {
  bestRollout,
  renderProbeChecks,
  renderProbeDiff,
  type ProbedRollout,
} from './explore.types.js';

const SELECT_LABEL = 'select';

export interface SelectProbeOutputInput {
  finals: readonly ProbedRollout[];
  /** The feature request, as `task.md`. */
  task: string;
  /** Seeds the anonymous ids: the same inputs always give the same ids. */
  seedKey: string;
  alwaysOnCharCap: number;
  featureId: string;
}

export interface ProbeSelection {
  chosen?: ProbedRollout;
  why: string;
  /** The selector could not decide; `chosen` is the fallback. */
  fellBack: boolean;
  /** anonymous id → label. */
  idMap: Record<string, string>;
  costUsd: number;
}

@injectable()
export class SelectProbeOutputUseCase {
  constructor(
    @inject('IHarnessImprover') private readonly improver: IHarnessImprover,
    @inject('IEvidenceWorkspace') private readonly workspace: IEvidenceWorkspace
  ) {}

  async execute(input: SelectProbeOutputInput): Promise<ProbeSelection> {
    const pool = input.finals.filter((r) => r.outcome.delivered);
    if (pool.length === 0) {
      return { why: 'no final rollout delivered a change', fellBack: true, idMap: {}, costUsd: 0 };
    }
    if (pool.length === 1) {
      return {
        chosen: pool[0],
        why: 'single delivered candidate — no selector needed',
        fellBack: false,
        idMap: { A: pool[0].label },
        costUsd: 0,
      };
    }

    const idMap = assignAnonymousIds(
      pool.map((r) => r.label),
      input.seedKey
    );
    const byLabel = new Map(pool.map((r) => [r.label, r]));
    const files: EvidenceFiles = { 'task.md': input.task };
    for (const [id, label] of Object.entries(idMap)) {
      const r = byLabel.get(label)!;
      files[`candidates/${id}/diff.md`] = renderProbeDiff(r);
      files[`candidates/${id}/checks.md`] = renderProbeChecks(r);
    }
    assertEvidenceAllowed(files);

    const ids = Object.keys(idMap);
    const root = await this.workspace.create(SELECT_LABEL, files, {});
    let costUsd = 0;
    let reason = '';
    try {
      const reply = await this.improver.run({
        label: SELECT_LABEL,
        spec: {
          stage: HarnessImproverStage.Select,
          k: pool.length,
          index: 1,
          candidateIds: ids,
          alwaysOnCharCap: input.alwaysOnCharCap,
        },
        workspaceRoot: root,
        featureId: input.featureId,
      });
      costUsd += reply.costUsd;
      const choice = parseChoice(reply.text, ids);
      if (choice.ok) {
        return {
          chosen: byLabel.get(idMap[choice.id]),
          why: choice.why,
          fellBack: false,
          idMap,
          costUsd,
        };
      }
      reason = choice.reason;
    } catch (error) {
      if (error instanceof ImproverError) costUsd += error.costUsd;
      reason = error instanceof Error ? error.message : String(error);
    } finally {
      await this.workspace.dispose(root);
    }
    return {
      chosen: bestRollout(pool),
      why: `selector failed (${reason}); kept the candidate whose checks passed, else the first that delivered`,
      fellBack: true,
      idMap,
      costUsd,
    };
  }
}
