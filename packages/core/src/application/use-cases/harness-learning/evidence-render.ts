/**
 * Evidence rendering for improver workspaces (spec 150) — pure functions that
 * turn a run's records into the files an improver reads under `context/`.
 *
 * Only an allowlisted set of top-level entries may appear: evidence about the
 * work and its execution. Post-hoc judgements (a merged diff to compare with,
 * a later human review score) never enter a workspace — the guard enforces it,
 * mirroring Harness² `assert_no_grader_verdicts` (google-research/harness2,
 * Apache-2.0).
 */

import type {
  AgentSession,
  Feature,
  HarnessLesson,
  LearnedHarnessVersion,
  PhaseTiming,
} from '../../../domain/generated/output.js';
import type { HarnessTree } from '../../../domain/harness-learning/harness-tree.js';
import type { EvidenceFiles } from '../../ports/output/services/evidence-workspace.interface.js';
import type { RunSignals } from './reflection.types.js';

/** A trajectory is truncated to this many characters (Harness² warns below 10k fabricates defects). */
export const TRAJECTORY_MAX_CHARS = 50_000;

/** Most recent agent sessions of a run included as trajectories. */
export const MAX_TRAJECTORIES = 8;

/** Lessons shown in a library index. */
export const MAX_LIBRARY_LESSONS = 20;

const ALLOWED_TOP_LEVEL = new Set([
  'task.md',
  'decisions.md',
  'adoption.md',
  'run',
  'trajectories',
  'library',
  'base_harness',
  'pool',
  'candidates',
]);

export class EvidenceLeakError extends Error {
  constructor(paths: string[]) {
    super(`evidence holds entries outside the allowlist: ${paths.join(', ')}`);
    this.name = 'EvidenceLeakError';
  }
}

export function assertEvidenceAllowed(files: EvidenceFiles): void {
  const bad = Object.keys(files).filter((path) => !ALLOWED_TOP_LEVEL.has(path.split('/')[0]));
  if (bad.length) throw new EvidenceLeakError(bad);
}

export function renderTask(feature: Pick<Feature, 'name' | 'description' | 'userQuery'>): string {
  return [
    `# ${feature.name}`,
    '',
    '## What was asked',
    '',
    feature.userQuery?.trim() || feature.description?.trim() || '(no description)',
    ...(feature.description && feature.description !== feature.userQuery
      ? ['', '## Description', '', feature.description.trim()]
      : []),
  ].join('\n');
}

export function renderSignals(signals: RunSignals): string {
  const lines = [
    '# How the run went',
    '',
    `- merged: ${signals.merged ? 'yes' : 'no'}`,
    `- CI status: ${signals.ciStatus ?? 'not reached'}`,
    `- CI-fix attempts: ${signals.ciFixAttempts}`,
    `- schema-validation repairs: ${signals.validationRepairs}`,
    `- phase rejections by a person: ${signals.rejectionFeedback.length}`,
  ];
  if (signals.error) lines.push(`- final error: ${signals.error}`);
  if (signals.rejectionFeedback.length) {
    lines.push('', '## Rejection feedback (oldest first)', '');
    signals.rejectionFeedback.forEach((f, i) => lines.push(`${i + 1}. ${f.trim()}`));
  }
  if (signals.ciFixHistory.length) {
    lines.push('', '## CI-fix attempts', '');
    for (const r of signals.ciFixHistory) {
      lines.push(`- attempt ${r.attempt} (${r.outcome}): ${r.failureSummary.trim()}`);
    }
  }
  if (signals.lastValidationErrors.length) {
    lines.push('', '## Last validation errors', '');
    for (const e of signals.lastValidationErrors) lines.push(`- ${e}`);
  }
  return lines.join('\n');
}

export function renderPhases(timings: readonly PhaseTiming[]): string {
  const rows = [...timings]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((t) => {
      const seconds = t.durationMs !== undefined ? Math.round(Number(t.durationMs) / 1000) : '';
      const cost = t.costUsd !== undefined ? t.costUsd.toFixed(2) : '';
      const error = (t.errorMessage ?? '').replace(/\|/g, '/').slice(0, 200);
      return `| ${t.phase} | ${seconds} | ${t.numTurns ?? ''} | ${cost} | ${t.exitCode ?? ''} | ${error} |`;
    });
  return [
    '# Phases',
    '',
    '| phase | seconds | turns | usd | exit | error |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function renderTrajectory(session: AgentSession, maxChars = TRAJECTORY_MAX_CHARS): string {
  const body = (session.messages ?? [])
    .map((m) => `[${m.role === 'user' ? 'PROMPT/OBSERVATION' : 'ACTION'}]\n${m.content}`)
    .join('\n\n');
  const head = `# Agent session ${session.id}\n\n`;
  if (body.length <= maxChars) return head + body;
  const half = Math.floor(maxChars / 2);
  return `${head}${body.slice(0, half)}\n\n[… ${body.length - maxChars} characters omitted …]\n\n${body.slice(-half)}`;
}

export function renderLibrary(
  lessons: readonly HarnessLesson[],
  rejected: readonly LearnedHarnessVersion[]
): string {
  const lines = [
    '# Library — what earlier refinements in this repository learned',
    '',
    'Lessons are about EDITING A HARNESS, from earlier features here. They are hypotheses for this run, not facts about it.',
  ];
  if (!lessons.length && !rejected.length) lines.push('', '_(empty — nothing learned here yet)_');
  for (const l of lessons.slice(0, MAX_LIBRARY_LESSONS)) {
    lines.push(
      '',
      `## ${l.cue}`,
      `- lesson: ${l.lesson}`,
      `- evidence: ${l.evidence}`,
      `- confidence: ${l.confidence}`
    );
  }
  if (rejected.length) {
    lines.push('', '# Candidates a person rejected — do not propose these again', '');
    for (const v of rejected) {
      lines.push(`- ${v.notes?.split('\n')[0] ?? v.id}: ${v.statusReason ?? 'no reason given'}`);
    }
  }
  return lines.join('\n');
}

/** A harness tree as evidence files under a prefix (e.g. `base_harness/`). */
export function treeFiles(prefix: string, tree: HarnessTree): EvidenceFiles {
  const files: EvidenceFiles = {};
  for (const [path, content] of Object.entries(tree)) files[`${prefix}/${path}`] = content;
  return files;
}
