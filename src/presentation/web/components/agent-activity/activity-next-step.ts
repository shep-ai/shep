/**
 * Where the web sends a user to move a feature along (spec 148) — the web
 * counterpart of the command `shep feat status` prints under "Next".
 */

import { AgentActivityState, FeatureStateReason } from '@shepai/core/domain/generated/output';
import type { AgentActivityView } from '@/lib/agent-activity-view';

/** A key under `agentActivity.next.` and where it leads. */
export interface ActivityNextStep {
  labelKey: 'answer' | 'review' | 'openPr' | 'resume';
  href: string;
  /** Opens outside Shep (the pull request). */
  external?: boolean;
}

const DRAWER_REVIEW_REASONS: ReadonlySet<FeatureStateReason> = new Set([
  FeatureStateReason.ApprovalGate,
  FeatureStateReason.PlanTaskInReview,
]);

export function featureHref(featureId: string): string {
  return `/feature/${encodeURIComponent(featureId)}`;
}

export function agentQuestionsHref(featureId: string): string {
  return `/agent-questions?${new URLSearchParams({ feature: featureId }).toString()}`;
}

export function activityNextStep(activity: AgentActivityView): ActivityNextStep | undefined {
  if (activity.reason === FeatureStateReason.AgentQuestion) {
    return { labelKey: 'answer', href: agentQuestionsHref(activity.featureId) };
  }
  if (DRAWER_REVIEW_REASONS.has(activity.reason)) {
    return { labelKey: 'review', href: featureHref(activity.featureId) };
  }
  if (activity.reason === FeatureStateReason.AwaitingReview && activity.pr?.url) {
    return { labelKey: 'openPr', href: activity.pr.url, external: true };
  }
  if (activity.state === AgentActivityState.Failed) {
    return { labelKey: 'resume', href: featureHref(activity.featureId) };
  }
  return undefined;
}
