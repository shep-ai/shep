import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ActivityWaitOutcome,
  AgentActivityState,
  FeatureStateReason,
} from '@shepai/core/domain/generated/output';
import { FeatureActivitySection } from '@/components/agent-activity/feature-activity-section';
import { activityView } from './fixtures';

const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast }));

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function snapshotOf(activity: ReturnType<typeof activityView>) {
  return {
    generatedAt: '2026-10-28T10:00:00.000Z',
    activities: [activity],
    counts: { working: 1, blocked: 0, waiting: 0, done: 0, failed: 0 },
    overall: activity.state,
    notFound: false,
  };
}

describe('FeatureActivitySection', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    toast.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the feature, settled included, and shows its card', async () => {
    fetchMock.mockImplementation(() => respond(snapshotOf(activityView())));
    render(<FeatureActivitySection featureId="feat-1234abcd" />);
    await waitFor(() =>
      expect(screen.getByTestId('feature-activity-card')).toHaveAttribute('data-state', 'working')
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/agent-activity?featureId=feat-1234abcd&includeSettled=1'
    );
  });

  it('notifies when the wait matches', async () => {
    const blocked = activityView({
      state: AgentActivityState.Blocked,
      reason: FeatureStateReason.ApprovalGate,
    });
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/agent-activity/wait')
        ? respond({ outcome: ActivityWaitOutcome.Matched, activity: blocked })
        : respond(snapshotOf(activityView()))
    );
    render(<FeatureActivitySection featureId="feat-1234abcd" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notify me' }));

    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    expect(toast).toHaveBeenCalledWith('Login page: Needs you', {
      description: 'Waiting for your approval',
    });
  });
});
