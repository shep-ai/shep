import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentActivityState, FeatureStateReason } from '@shepai/core/domain/generated/output';
import { ActivityStateBadge } from '@/components/agent-activity/activity-state-badge';
import { FeatureActivityCard } from '@/components/agent-activity/feature-activity-card';
import { activityView } from './fixtures';

const QUESTION = activityView({
  state: AgentActivityState.Blocked,
  reason: FeatureStateReason.AgentQuestion,
  pendingQuestions: 1,
  pendingQuestion: { id: 'q-1', appId: 'app-1', prompt: 'Which OAuth provider?' },
});

describe('ActivityStateBadge', () => {
  it('names each state and marks it for styling', () => {
    render(<ActivityStateBadge state={AgentActivityState.Blocked} />);
    const badge = screen.getByTestId('activity-state-badge');
    expect(badge).toHaveTextContent('Needs you');
    expect(badge).toHaveAttribute('data-state', 'blocked');
  });
});

describe('FeatureActivityCard', () => {
  it('explains the state, what the agent asks and where to answer', () => {
    render(<FeatureActivityCard activity={QUESTION} />);
    expect(screen.getByTestId('feature-activity-card')).toHaveAttribute('data-state', 'blocked');
    expect(screen.getByTestId('activity-state-badge')).toHaveTextContent('Needs you');
    expect(screen.getByTestId('feature-activity-why')).toHaveTextContent(
      'The agent asked a question'
    );
    expect(screen.getByTestId('feature-activity-asks')).toHaveTextContent('Which OAuth provider?');
    expect(screen.getByTestId('feature-activity-phase')).toHaveTextContent('implement');
    const next = screen.getByRole('link', { name: 'Answer the question' });
    expect(next).toHaveAttribute('href', '/agent-questions?feature=feat-1234abcd');
  });

  it('in the drawer, points at its own actions instead of linking to itself', () => {
    render(
      <FeatureActivityCard
        inDrawer
        activity={activityView({
          state: AgentActivityState.Blocked,
          reason: FeatureStateReason.ApprovalGate,
        })}
      />
    );
    expect(screen.queryByRole('link', { name: 'Review and approve' })).toBeNull();
    expect(screen.getByTestId('feature-activity-next')).toHaveTextContent(
      'Approve or reject in its review tab'
    );
  });

  it('in the drawer, points a failed run at Retry', () => {
    render(
      <FeatureActivityCard
        inDrawer
        activity={activityView({
          state: AgentActivityState.Failed,
          reason: FeatureStateReason.RunFailed,
        })}
      />
    );
    expect(screen.getByTestId('feature-activity-next')).toHaveTextContent(
      'Use Retry at the top of this drawer'
    );
  });

  it('shows the error of a failed run', () => {
    render(
      <FeatureActivityCard
        activity={activityView({
          state: AgentActivityState.Failed,
          reason: FeatureStateReason.RunFailed,
          error: 'Agent exited with code 1',
        })}
      />
    );
    expect(screen.getByTestId('feature-activity-error')).toHaveTextContent(
      'Agent exited with code 1'
    );
  });

  it('offers Notify me only while there is something to wait for', async () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <FeatureActivityCard
        activity={activityView()}
        notify={{ watching: false, error: null, onStart, onStop: vi.fn() }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(onStart).toHaveBeenCalledOnce();

    rerender(
      <FeatureActivityCard
        activity={QUESTION}
        notify={{ watching: false, error: null, onStart, onStop: vi.fn() }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Notify me' })).toBeNull();
  });

  it('shows that it is watching, with a way to stop', async () => {
    const onStop = vi.fn();
    render(
      <FeatureActivityCard
        activity={activityView()}
        notify={{ watching: true, error: null, onStart: vi.fn(), onStop }}
      />
    );
    expect(screen.getByTestId('feature-activity-watching')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('renders loading, error and not-found states', () => {
    const { rerender } = render(<FeatureActivityCard loading />);
    expect(screen.getByTestId('feature-activity-card')).toHaveAttribute('aria-busy', 'true');
    rerender(<FeatureActivityCard error="database is locked" />);
    expect(screen.getByTestId('feature-activity-card')).toHaveTextContent('database is locked');
    rerender(<FeatureActivityCard notFound />);
    expect(screen.getByTestId('feature-activity-card')).toHaveTextContent(
      'This feature has no agent status'
    );
  });
});
