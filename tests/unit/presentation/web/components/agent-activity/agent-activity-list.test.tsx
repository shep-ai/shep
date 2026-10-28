import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgentActivityState, FeatureStateReason } from '@shepai/core/domain/generated/output';
import { AgentActivityList } from '@/components/agent-activity/agent-activity-list';
import { activityView } from './fixtures';

describe('AgentActivityList', () => {
  it('shows one row per feature with its state, why and a link to open it', () => {
    render(
      <AgentActivityList
        activities={[
          activityView({
            featureId: 'feat-a',
            name: 'Login page',
            state: AgentActivityState.Blocked,
            reason: FeatureStateReason.ApprovalGate,
          }),
          activityView({ featureId: 'feat-b', name: 'Search' }),
        ]}
      />
    );
    const rows = screen.getAllByTestId('agent-activity-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-state', 'blocked');
    expect(within(rows[0]).getByText('Login page')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Waiting for your approval')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: 'Review and approve' })).toHaveAttribute(
      'href',
      '/feature/feat-a'
    );
    expect(within(rows[1]).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/feature/feat-b'
    );
  });

  it('shows what the agent asks', () => {
    render(
      <AgentActivityList
        activities={[
          activityView({
            state: AgentActivityState.Blocked,
            reason: FeatureStateReason.AgentQuestion,
            pendingQuestion: { id: 'q-1', prompt: 'Which OAuth provider?' },
          }),
        ]}
      />
    );
    expect(screen.getByTestId('agent-activity-row-asks')).toHaveTextContent(
      'Which OAuth provider?'
    );
  });

  it('says so when nothing is active', () => {
    render(<AgentActivityList activities={[]} />);
    expect(screen.getByTestId('agent-activity-list')).toHaveTextContent(
      'No feature is active right now'
    );
  });
});
