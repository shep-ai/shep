import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentActivityState, FeatureStateReason } from '@shepai/core/domain/generated/output';
import { AgentActivityPageClient } from '@/components/features/agent-activity/agent-activity-page-client';
import { activityView } from '../../components/agent-activity/fixtures';

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const ACTIVITIES = [
  activityView({
    featureId: 'feat-a',
    name: 'Login page',
    state: AgentActivityState.Blocked,
    reason: FeatureStateReason.ApprovalGate,
  }),
  activityView({ featureId: 'feat-b', name: 'Search' }),
];

const SNAPSHOT = {
  generatedAt: '2026-10-28T10:00:00.000Z',
  activities: ACTIVITIES,
  counts: { working: 1, blocked: 1, waiting: 0, done: 0, failed: 0 },
  overall: AgentActivityState.Blocked,
  notFound: false,
};

describe('AgentActivityPageClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the active features with a count per state', async () => {
    fetchMock.mockImplementation(() => respond(SNAPSHOT));
    render(<AgentActivityPageClient />);
    expect(await screen.findAllByTestId('agent-activity-row')).toHaveLength(2);
    expect(screen.getByTestId('agent-activity-count-blocked')).toHaveTextContent('1');
    expect(screen.getByTestId('agent-activity-count-working')).toHaveTextContent('1');
    expect(screen.getByTestId('agent-activity-needs-you')).toHaveTextContent('1 need you');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/agent-activity');
  });

  it('reads finished features too when asked', async () => {
    fetchMock.mockImplementation(() => respond(SNAPSHOT));
    render(<AgentActivityPageClient />);
    await screen.findAllByTestId('agent-activity-row');
    await userEvent.click(screen.getByRole('switch', { name: 'Show finished' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/agent-activity?includeSettled=1')
    );
  });

  it('shows a read error', async () => {
    fetchMock.mockImplementation(() => respond({ error: 'database is locked' }, 500));
    render(<AgentActivityPageClient />);
    expect(await screen.findByTestId('agent-activity-page-error')).toHaveTextContent(
      'database is locked'
    );
  });
});
