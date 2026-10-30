/**
 * Explore mode types (spec 150): a rollout is one implementation attempt of
 * the feature, under one harness, in one probe worktree.
 */

import type { HarnessTree } from '../../../domain/harness-learning/harness-tree.js';
import type { ProbeOutcome } from '../../ports/output/services/probe-worktree.interface.js';

export interface RolloutRequest {
  label: string;
  /** Absolute path of the probe worktree the attempt works in. */
  worktreePath: string;
  /** The harness the attempt runs under. */
  tree: HarnessTree;
}

export interface RolloutResult {
  /** The agent's final message. */
  text: string;
  costUsd: number;
  error?: string;
}

/**
 * Runs one implementation attempt. Built per feature run by the feature agent
 * (it owns the implement prompt); the refinement only says where and with
 * which harness.
 */
export interface IHarnessRolloutRunner {
  rollout(request: RolloutRequest): Promise<RolloutResult>;
}

/** A finished rollout: the attempt plus what its probe shows. */
export interface ProbedRollout {
  label: string;
  tree: HarnessTree;
  result: RolloutResult;
  outcome: ProbeOutcome;
}

const RUN_TEXT_CHARS = 4000;
const DIFF_CHARS = 30_000;

/** A rollout as evidence (`pool/<label>/run.md`, `candidates/<id>/…`). */
export function renderProbeRun(r: ProbedRollout): string {
  const checks = r.outcome.checks.length
    ? r.outcome.checks
        .map(
          (c) =>
            `- \`${c.command}\`: ${c.passed ? 'passed' : c.timedOut ? 'timed out' : `failed (exit ${c.exitCode})`}\n\n\`\`\`\n${c.output}\n\`\`\``
        )
        .join('\n\n')
    : '- no check command configured or detected';
  return [
    `# Execution ${r.label}`,
    '',
    `- delivered a change: ${r.outcome.delivered ? 'yes' : 'NO'}`,
    ...(r.result.error ? [`- agent error: ${r.result.error}`] : []),
    `- cost: $${r.result.costUsd.toFixed(2)}`,
    '',
    '## Files changed',
    '',
    r.outcome.diffStat || '(none)',
    '',
    '## Checks',
    '',
    checks,
    '',
    "## The agent's final message",
    '',
    r.result.text.slice(-RUN_TEXT_CHARS) || '(empty)',
  ].join('\n');
}

export function renderProbeDiff(r: ProbedRollout): string {
  const diff = r.outcome.diff;
  return `\`\`\`diff\n${diff.length > DIFF_CHARS ? `${diff.slice(0, DIFF_CHARS)}\n… (truncated)` : diff}\n\`\`\``;
}

export function renderProbeChecks(r: ProbedRollout): string {
  return r.outcome.checks.length
    ? r.outcome.checks
        .map(
          (c) =>
            `## \`${c.command}\` — ${c.passed ? 'passed' : 'failed'}\n\n\`\`\`\n${c.output}\n\`\`\``
        )
        .join('\n\n')
    : 'No check command is configured or detected for this repository.';
}

/** Passing checks first, then any delivered change, then the first — the fallback when selection fails. */
export function bestRollout(rollouts: readonly ProbedRollout[]): ProbedRollout | undefined {
  const passing = (r: ProbedRollout) =>
    r.outcome.delivered && r.outcome.checks.length > 0 && r.outcome.checks.every((c) => c.passed);
  return (
    rollouts.find(passing) ??
    rollouts.find((r) => r.outcome.delivered && !r.result.error) ??
    rollouts.find((r) => r.outcome.delivered)
  );
}
