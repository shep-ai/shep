/**
 * Storybook data for the agent-activity components (spec 148): sample
 * activities, and a fetch stub serving the activity routes.
 */

import {
  ActivityWaitOutcome,
  AgentActivityState,
  AgentRunStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@shepai/core/domain/generated/output';
import {
  AGENT_ACTIVITY_PATH,
  AGENT_ACTIVITY_WAIT_PATH,
  type AgentActivitySnapshotView,
  type AgentActivityView,
} from '@/lib/agent-activity-view';

function sample(overrides: Partial<AgentActivityView>): AgentActivityView {
  return {
    featureId: 'feat-3f9c2a71',
    shortId: 'feat-3f9',
    name: 'Login page',
    repositoryPath: '/work/acme-web',
    branch: 'feat/login-page',
    state: AgentActivityState.Working,
    reason: FeatureStateReason.AgentRunning,
    featureState: FeatureState.Running,
    lifecycle: SdlcLifecycle.Implementation,
    phase: 'implement',
    runStatus: AgentRunStatus.running,
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Stop],
    version: 1_793_000_000_000,
    updatedAt: '2026-10-28T10:00:00.000Z',
    ...overrides,
  };
}

export const WORKING_ACTIVITY = sample({});

export const GATE_ACTIVITY = sample({
  featureId: 'feat-8b21d004',
  shortId: 'feat-8b2',
  name: 'Dark mode toggle',
  branch: 'feat/dark-mode',
  state: AgentActivityState.Blocked,
  reason: FeatureStateReason.ApprovalGate,
  featureState: FeatureState.ActionRequired,
  lifecycle: SdlcLifecycle.Review,
  phase: 'merge',
  runStatus: AgentRunStatus.waitingApproval,
  actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
});

export const QUESTION_ACTIVITY = sample({
  featureId: 'feat-51aa90e2',
  shortId: 'feat-51a',
  name: 'Checkout retries',
  branch: 'feat/checkout-retries',
  state: AgentActivityState.Blocked,
  reason: FeatureStateReason.AgentQuestion,
  phase: 'plan',
  pendingQuestions: 1,
  pendingQuestion: {
    id: 'q-7d1',
    appId: 'app-acme',
    prompt: 'Retry failed payments up to 3 times, or hand them to support right away?',
  },
});

export const QUEUED_ACTIVITY = sample({
  featureId: 'feat-0c7e66b9',
  shortId: 'feat-0c7',
  name: 'Search filters',
  branch: 'feat/search-filters',
  state: AgentActivityState.Waiting,
  reason: FeatureStateReason.QueuedForCapacity,
  featureState: FeatureState.Queued,
  lifecycle: SdlcLifecycle.Started,
  phase: 'requirements',
  runStatus: undefined,
  actions: [],
});

export const FAILED_ACTIVITY = sample({
  featureId: 'feat-e4402b13',
  shortId: 'feat-e44',
  name: 'CSV export',
  branch: 'feat/csv-export',
  state: AgentActivityState.Failed,
  reason: FeatureStateReason.RunFailed,
  featureState: FeatureState.Error,
  runStatus: AgentRunStatus.failed,
  error: 'Tests failed after 3 fix attempts: export.test.ts › escapes quotes',
  actions: [FeatureConsoleAction.Resume],
});

export const DONE_ACTIVITY = sample({
  featureId: 'feat-77f0c3d8',
  shortId: 'feat-77f',
  name: 'Password reset email',
  branch: 'feat/password-reset',
  state: AgentActivityState.Done,
  reason: FeatureStateReason.RunCompleted,
  featureState: FeatureState.Done,
  lifecycle: SdlcLifecycle.Maintain,
  phase: 'maintain',
  runStatus: AgentRunStatus.completed,
  actions: [],
});

export const FLEET_ACTIVITIES = [
  QUESTION_ACTIVITY,
  GATE_ACTIVITY,
  WORKING_ACTIVITY,
  QUEUED_ACTIVITY,
  FAILED_ACTIVITY,
];

export function snapshotOf(activities: AgentActivityView[]): AgentActivitySnapshotView {
  const counts = {
    [AgentActivityState.Working]: 0,
    [AgentActivityState.Blocked]: 0,
    [AgentActivityState.Waiting]: 0,
    [AgentActivityState.Done]: 0,
    [AgentActivityState.Failed]: 0,
  };
  for (const activity of activities) counts[activity.state] += 1;
  return {
    generatedAt: '2026-10-28T10:00:00.000Z',
    activities,
    counts,
    overall: activities[0]?.state ?? AgentActivityState.Done,
    notFound: false,
  };
}

/** What the stubbed activity routes answer. */
export interface ActivityFetchStub {
  activities?: AgentActivityView[];
  /** Answer the snapshot route with this error (status 500). */
  error?: string;
  /** Never answer the snapshot route (loading). */
  pending?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Replace window.fetch for the activity routes; other URLs pass through.
 * A wait never answers, so "Notify me" stays in its watching state.
 */
export function stubActivityFetch(stub: ActivityFetchStub): void {
  const original = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(AGENT_ACTIVITY_WAIT_PATH)) {
      return new Promise<Response>((resolve) =>
        init?.signal?.addEventListener('abort', () =>
          resolve(json({ outcome: ActivityWaitOutcome.Aborted }))
        )
      );
    }
    if (url.startsWith(AGENT_ACTIVITY_PATH)) {
      if (stub.pending) return new Promise<Response>(() => undefined);
      if (stub.error) return json({ error: stub.error }, 500);
      return json(snapshotOf(stub.activities ?? []));
    }
    return original(input, init);
  }) as typeof window.fetch;
}
