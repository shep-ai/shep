/**
 * Bug loop rules (spec 123): how an agent's raw hypotheses become ranked,
 * numbered hypotheses with repository-relative evidence, and when an
 * investigation still counts as running.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import {
  HypothesisConfidence,
  InvestigationStatus,
  type Hypothesis,
  type HypothesisEvidence,
} from '../generated/output';

/** Most hypotheses kept from one investigation. */
export const MAX_HYPOTHESES = 5;

const MS_PER_MINUTE = 60_000;

/** The agent's budget for one investigation. */
export const INVESTIGATION_TIMEOUT_MS = 20 * MS_PER_MINUTE;

/**
 * An active investigation not updated for this long belongs to a process
 * that is gone: the agent budget plus time to prepare and clean up.
 */
export const INVESTIGATION_STALE_AFTER_MS = INVESTIGATION_TIMEOUT_MS + 5 * MS_PER_MINUTE;

/** A hypothesis as the agent returns it, before validation. */
export interface RawHypothesis {
  title: string;
  rootCause: string;
  confidence: string;
  evidence: { file: string; line?: number; note: string }[];
  testPlan: string;
  fixPlan: string;
}

/** What the agent returns for one investigation. */
export interface RawInvestigationResult {
  summary: string;
  hypotheses: RawHypothesis[];
}

export const CONFIDENCE_ORDER: readonly HypothesisConfidence[] = [
  HypothesisConfidence.High,
  HypothesisConfidence.Medium,
  HypothesisConfidence.Low,
];

/** A confidence level from free text; Low when unrecognised. */
export function parseConfidence(value: unknown): HypothesisConfidence {
  const text = String(value ?? '').toLowerCase();
  return CONFIDENCE_ORDER.find((level) => level.toLowerCase() === text) ?? HypothesisConfidence.Low;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function forwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

/** A path relative to the worktree root, with forward slashes. */
function repositoryRelative(file: string, worktreePath: string): string {
  const normalized = forwardSlashes(file.trim());
  const root = `${forwardSlashes(worktreePath).replace(/\/+$/, '')}/`;
  const relative = normalized.toLowerCase().startsWith(root.toLowerCase())
    ? normalized.slice(root.length)
    : normalized;
  return relative.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

function normaliseEvidence(
  evidence: RawHypothesis['evidence'] | undefined,
  worktreePath: string
): HypothesisEvidence[] {
  return (Array.isArray(evidence) ? evidence : []).flatMap((item) => {
    const file = repositoryRelative(text(item?.file), worktreePath);
    if (file === '') return [];
    const line = item.line;
    const validLine = typeof line === 'number' && Number.isInteger(line) && line > 0;
    return [{ file, ...(validLine ? { line } : {}), note: text(item.note) }];
  });
}

/**
 * Validates the agent's hypotheses: drops those without a title or root
 * cause, orders by confidence (keeping the agent's order within a level),
 * keeps the first {@link MAX_HYPOTHESES}, numbers them from 1 and makes
 * evidence paths relative to the investigated worktree.
 */
export function rankHypotheses(raw: RawHypothesis[], worktreePath: string): Hypothesis[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => text(item?.title) !== '' && text(item?.rootCause) !== '')
    .map((item) => ({ item, confidence: parseConfidence(item.confidence) }))
    .sort((a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence))
    .slice(0, MAX_HYPOTHESES)
    .map(({ item, confidence }, index) => ({
      number: index + 1,
      title: text(item.title),
      rootCause: text(item.rootCause),
      confidence,
      evidence: normaliseEvidence(item.evidence, worktreePath),
      testPlan: text(item.testPlan),
      fixPlan: text(item.fixPlan),
    }));
}

interface InvestigationActivity {
  status: InvestigationStatus;
  updatedAt: Date | string;
}

function isOpen(status: InvestigationStatus): boolean {
  return status === InvestigationStatus.Pending || status === InvestigationStatus.Running;
}

function isOverdue(investigation: InvestigationActivity, now: Date): boolean {
  return now.getTime() - new Date(investigation.updatedAt).getTime() > INVESTIGATION_STALE_AFTER_MS;
}

/** Pending or running, and recently updated. */
export function isInvestigationActive(investigation: InvestigationActivity, now: Date): boolean {
  return isOpen(investigation.status) && !isOverdue(investigation, now);
}

/** Pending or running, but abandoned by the process that ran it. */
export function isInvestigationStale(investigation: InvestigationActivity, now: Date): boolean {
  return isOpen(investigation.status) && isOverdue(investigation, now);
}
