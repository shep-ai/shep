/**
 * Autopilot (spec 132): which urgent work items to investigate, which
 * hypotheses are confident enough to fix unasked, how many fixes a day may
 * start, which gates a fix passes, and which opportunities to build.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import {
  HypothesisConfidence,
  InvestigationStatus,
  OpportunityStatus,
  Priority,
  SdlcLifecycle,
  StateGroup,
  type ApprovalGates,
  type AutopilotPolicy,
  type AutopilotRun,
  type WorkItem,
  type WorkItemInvestigation,
} from '../generated/output';
import type { ScoredOpportunity } from './opportunity-score';

export const DEFAULT_DAILY_FIX_BUDGET = 3;
export const MAX_DAILY_FIX_BUDGET = 20;
/** Investigations one pass starts in a space; each can take many minutes. */
export const MAX_INVESTIGATIONS_PER_PASS = 2;
const FIX_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOP_HYPOTHESIS = 1;
const CLOSED_GROUPS: readonly StateGroup[] = [StateGroup.Completed, StateGroup.Cancelled];

export function defaultAutopilotPolicy(spaceId: string, now: Date): AutopilotPolicy {
  return {
    spaceId,
    investigateUrgent: false,
    fixConfident: false,
    mergeFixes: false,
    fillLine: false,
    dailyFixBudget: DEFAULT_DAILY_FIX_BUDGET,
    updatedAt: now,
  };
}

export function isAutopilotOn(policy: AutopilotPolicy): boolean {
  return policy.investigateUrgent || policy.fixConfident || policy.fillLine;
}

export function isUrgentOpen(
  workItem: Pick<WorkItem, 'priority'>,
  group: StateGroup | undefined
): boolean {
  return workItem.priority === Priority.Urgent && !(group && CLOSED_GROUPS.includes(group));
}

/** The hypothesis number to fix unasked, or undefined. */
export function confidentHypothesis(investigation: WorkItemInvestigation): number | undefined {
  if (investigation.status !== InvestigationStatus.Completed || investigation.featureId) {
    return undefined;
  }
  const top = investigation.hypotheses.find((h) => h.number === TOP_HYPOTHESIS);
  return top?.confidence === HypothesisConfidence.High ? top.number : undefined;
}

/** Fixes still allowed in the 24 hours before `now`. */
export function fixesLeft(runs: readonly AutopilotRun[], budget: number, now: Date): number {
  const since = now.getTime() - FIX_BUDGET_WINDOW_MS;
  const started = runs
    .filter((run) => new Date(run.createdAt).getTime() > since)
    .reduce((sum, run) => sum + run.fixed.length, 0);
  return Math.max(0, budget - started);
}

export function fixGates(policy: AutopilotPolicy): ApprovalGates {
  return { allowPrd: true, allowPlan: true, allowMerge: policy.mergeFixes };
}

/** The opportunities of the line that are accepted but not building yet. */
export function linesToBuild(inLine: readonly ScoredOpportunity[]): ScoredOpportunity[] {
  return inLine.filter(({ opportunity }) => opportunity.status === OpportunityStatus.Accepted);
}

const FINISHED_LIFECYCLES: readonly SdlcLifecycle[] = [
  SdlcLifecycle.Maintain,
  SdlcLifecycle.Deleting,
  SdlcLifecycle.Archived,
];

/** A feature still on its way through the pipeline. */
export function isFeatureInFlight(lifecycle: SdlcLifecycle): boolean {
  return !FINISHED_LIFECYCLES.includes(lifecycle);
}
