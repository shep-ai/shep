/**
 * One improvement stage (spec 150): give an improver the evidence and the
 * current harness, read its edits back, repair trigger lines, validate, and
 * retry once with the validator's message. Two invalid attempts inherit the
 * current harness — a proposal is never half-applied. Adapted from Harness²
 * `core/recursion.py::_run_stage` (google-research/harness2, Apache-2.0).
 */

import type {
  EvidenceFiles,
  IEvidenceWorkspace,
} from '../../ports/output/services/evidence-workspace.interface.js';
import {
  ImproverError,
  type IHarnessImprover,
  type ImproverStageSpec,
} from '../../ports/output/services/harness-improver.interface.js';
import { isKeepBase, parseNotes } from '../../../domain/harness-learning/improver-reply-parsers.js';
import {
  autotrigger,
  diffHarness,
  isUnchanged,
  type HarnessTree,
} from '../../../domain/harness-learning/harness-tree.js';
import { validateHarnessTree } from '../../../domain/harness-learning/harness-validator.js';

/** One retry carrying the validator's message, as in Harness². */
export const STAGE_ATTEMPTS = 2;

const MAX_ERROR_CHARS = 2000;

export interface StageDeps {
  improver: IHarnessImprover;
  workspace: IEvidenceWorkspace;
}

export interface StageInput {
  label: string;
  spec: ImproverStageSpec;
  files: EvidenceFiles;
  current: HarnessTree;
  featureId?: string;
}

export interface StageResult {
  label: string;
  tree: HarnessTree;
  /** The improver's notes: each change with the trajectory moment behind it. */
  notes: string;
  /** The stage argued for no change. */
  keptBase: boolean;
  /** Every attempt failed; `tree` is the current harness. */
  fellBack: boolean;
  error?: string;
  costUsd: number;
  /** Improver sessions spent, retries included. */
  sessions: number;
}

export async function runImproverStage(deps: StageDeps, input: StageInput): Promise<StageResult> {
  const root = await deps.workspace.create(input.label, input.files, input.current);
  let costUsd = 0;
  let sessions = 0;
  let feedback: string | undefined;
  try {
    for (let attempt = 1; attempt <= STAGE_ATTEMPTS; attempt++) {
      let text: string;
      try {
        sessions += 1;
        const reply = await deps.improver.run({
          label: `${input.label}.a${attempt}`,
          spec: input.spec,
          workspaceRoot: root,
          ...(feedback ? { retryFeedback: feedback } : {}),
          ...(input.featureId ? { featureId: input.featureId } : {}),
        });
        costUsd += reply.costUsd;
        text = reply.text;
      } catch (error) {
        if (error instanceof ImproverError) costUsd += error.costUsd;
        feedback = error instanceof Error ? error.message : String(error);
        break;
      }

      const { tree, rejected } = await deps.workspace.readHarness(root);
      if (rejected.length > 0) {
        feedback = `these files are off the editable surface and were not applied: ${rejected.join(', ')}. Use the documented paths.`;
        continue;
      }
      if (Object.keys(tree).length === 0 && Object.keys(input.current).length > 0) {
        feedback =
          '`context/harness/` came back empty — edit the files in place, do not delete them all.';
        continue;
      }
      const repaired = autotrigger(tree, input.spec.alwaysOnCharCap).tree;
      const problems = validateHarnessTree(repaired, {
        alwaysOnCharCap: input.spec.alwaysOnCharCap,
      });
      if (problems.length > 0) {
        feedback = problems.join('\n');
        continue;
      }
      return {
        label: input.label,
        tree: repaired,
        notes: parseNotes(text),
        keptBase: isKeepBase(text) || isUnchanged(diffHarness(input.current, repaired)),
        fellBack: false,
        costUsd,
        sessions,
      };
    }
  } finally {
    await deps.workspace.dispose(root);
  }
  return {
    label: input.label,
    tree: { ...input.current },
    notes: '',
    keptBase: false,
    fellBack: true,
    error: (feedback ?? 'no attempt succeeded').slice(0, MAX_ERROR_CHARS),
    costUsd,
    sessions,
  };
}
