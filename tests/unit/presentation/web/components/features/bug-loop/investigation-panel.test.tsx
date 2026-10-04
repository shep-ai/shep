import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvestigationStatus } from '@shepai/core/domain/generated/output';
import { InvestigationPanel } from '@/components/features/bug-loop/investigation-panel';
import { INVESTIGATION_POLL_MS } from '@/components/features/bug-loop/use-investigation';
import {
  APPROVED_INVESTIGATION,
  COMPLETED_INVESTIGATION,
  FAILED_INVESTIGATION,
  PENDING_INVESTIGATION,
  SAMPLE_REPOSITORIES,
} from '@/components/features/bug-loop/bug-loop-fixtures';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  getLatestInvestigation: vi.fn(),
  startInvestigation: vi.fn(),
  approveHypothesis: vi.fn(),
}));
vi.mock('@/app/actions/bug-loop', () =>
  Object.fromEntries(
    Object.keys(actions).map((name) => [
      name,
      (...a: unknown[]) => actions[name as keyof typeof actions](...a),
    ])
  )
);

function panel(props: Partial<Parameters<typeof InvestigationPanel>[0]> = {}) {
  return render(
    <InvestigationPanel workItemId="item-1" repositories={SAMPLE_REPOSITORIES} {...props} />
  );
}

describe('InvestigationPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('starts an investigation in the chosen repository', async () => {
    actions.startInvestigation.mockResolvedValue({
      ok: true,
      investigation: PENDING_INVESTIGATION,
    });
    actions.getLatestInvestigation.mockResolvedValue({ investigation: PENDING_INVESTIGATION });
    panel();

    await userEvent.selectOptions(screen.getByRole('combobox'), '/Users/me/src/web');
    await userEvent.click(screen.getByRole('button', { name: 'Investigate' }));

    expect(actions.startInvestigation).toHaveBeenCalledWith({
      workItemId: 'item-1',
      repositoryPath: '/Users/me/src/web',
    });
    expect(await screen.findByText(/reading a read-only copy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Investigate' })).not.toBeInTheDocument();
  });

  it('shows a refusal', async () => {
    actions.startInvestigation.mockResolvedValue({
      ok: false,
      error: 'PAY-42 is already being investigated.',
    });
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already being investigated');
  });

  it('polls while the agent runs and shows the hypotheses when it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    actions.getLatestInvestigation.mockResolvedValue({ investigation: COMPLETED_INVESTIGATION });
    panel({ initialInvestigation: PENDING_INVESTIGATION });

    expect(screen.queryByTestId('hypothesis-1')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INVESTIGATION_POLL_MS);
    });
    expect(actions.getLatestInvestigation).toHaveBeenCalledWith('item-1');
    expect(await screen.findByTestId('hypothesis-1')).toHaveTextContent(
      'Guest orders have no customer id'
    );
    expect(screen.getByText('src/orders/order.ts:17')).toBeInTheDocument();
  });

  it('turns a hypothesis into a fix feature, optionally through the full spec pipeline', async () => {
    actions.approveHypothesis.mockResolvedValue({ ok: true, featureId: 'feature-1' });
    actions.getLatestInvestigation.mockResolvedValue({ investigation: APPROVED_INVESTIGATION });
    panel({ initialInvestigation: COMPLETED_INVESTIGATION });

    await userEvent.click(screen.getByRole('switch'));
    const [first] = screen.getAllByRole('button', { name: 'Fix this' });
    await userEvent.click(first);

    expect(actions.approveHypothesis).toHaveBeenCalledWith({
      workItemId: 'item-1',
      investigationId: COMPLETED_INVESTIGATION.id,
      hypothesis: 1,
      fullSpec: true,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Open the fix feature' })).toHaveAttribute(
      'href',
      '/feature/feature-1'
    );
    expect(screen.queryByRole('button', { name: 'Fix this' })).not.toBeInTheDocument();
  });

  it('shows why an investigation failed and offers to run it again', () => {
    panel({ initialInvestigation: FAILED_INVESTIGATION });
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    expect(screen.getByRole('button', { name: 'Investigate again' })).toBeEnabled();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('asks for a repository when shep has none', () => {
    panel({ repositories: [] });
    expect(screen.getByText(/Add a repository to shep/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Investigate' })).toBeDisabled();
  });

  it('does not poll a finished investigation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    panel({
      initialInvestigation: { ...COMPLETED_INVESTIGATION, status: InvestigationStatus.Completed },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INVESTIGATION_POLL_MS * 2);
    });
    expect(actions.getLatestInvestigation).not.toHaveBeenCalled();
  });
});
