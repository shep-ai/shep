import { describe, it, expect } from 'vitest';
import { AgentActivityState, FeatureStateReason } from '@shepai/core/domain/generated/output';
import { activityNextStep, featureHref } from '@/components/agent-activity/activity-next-step';
import { activityView } from './fixtures';

describe('activityNextStep', () => {
  it('sends an agent question to the inbox for the feature', () => {
    expect(
      activityNextStep(
        activityView({
          state: AgentActivityState.Blocked,
          reason: FeatureStateReason.AgentQuestion,
        })
      )
    ).toEqual({ labelKey: 'answer', href: '/agent-questions?feature=feat-1234abcd' });
  });

  it('sends a gate and a plan review to the feature drawer', () => {
    for (const reason of [FeatureStateReason.ApprovalGate, FeatureStateReason.PlanTaskInReview]) {
      expect(activityNextStep(activityView({ state: AgentActivityState.Blocked, reason }))).toEqual(
        { labelKey: 'review', href: featureHref('feat-1234abcd') }
      );
    }
  });

  it('sends a review to the pull request when there is one', () => {
    const step = activityNextStep(
      activityView({
        state: AgentActivityState.Blocked,
        reason: FeatureStateReason.AwaitingReview,
        pr: { number: 7, url: 'https://github.com/acme/web/pull/7' } as never,
      })
    );
    expect(step).toEqual({
      labelKey: 'openPr',
      href: 'https://github.com/acme/web/pull/7',
      external: true,
    });
  });

  it('offers the drawer to resume a failed run', () => {
    expect(
      activityNextStep(
        activityView({ state: AgentActivityState.Failed, reason: FeatureStateReason.RunFailed })
      )
    ).toEqual({ labelKey: 'resume', href: '/feature/feat-1234abcd' });
  });

  it('has nothing to do for a working or finished feature', () => {
    expect(activityNextStep(activityView())).toBeUndefined();
    expect(
      activityNextStep(
        activityView({ state: AgentActivityState.Done, reason: FeatureStateReason.RunCompleted })
      )
    ).toBeUndefined();
  });
});
