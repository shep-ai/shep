import {
  AgentActivityState,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@shepai/core/domain/generated/output';
import type { AgentActivityView } from '@/lib/agent-activity-view';

export function activityView(overrides: Partial<AgentActivityView> = {}): AgentActivityView {
  return {
    featureId: 'feat-1234abcd',
    shortId: 'feat-123',
    name: 'Login page',
    repositoryPath: '/work/acme-web',
    branch: 'feat/login-page',
    state: AgentActivityState.Working,
    reason: FeatureStateReason.AgentRunning,
    featureState: FeatureState.Running,
    lifecycle: SdlcLifecycle.Implementation,
    phase: 'implement',
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Stop],
    version: 1,
    updatedAt: '2026-10-28T10:00:00.000Z',
    ...overrides,
  };
}
