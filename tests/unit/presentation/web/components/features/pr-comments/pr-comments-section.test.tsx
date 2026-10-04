import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrCommentsSection } from '@/components/features/pr-comments/pr-comments-section';
import { PR_COMMENTS_POLL_MS } from '@/components/features/pr-comments/use-pr-comments';
import {
  ADDRESSED_STATE,
  FAILED_STATE,
  PENDING_STATE,
  RUNNING_STATE,
} from '@/components/features/pr-comments/pr-comments-fixtures';

const actions = vi.hoisted(() => ({
  getPrComments: vi.fn(),
  refreshPrComments: vi.fn(),
  addressPrComments: vi.fn(),
}));
vi.mock('@/app/actions/pr-comments', () =>
  Object.fromEntries(
    Object.keys(actions).map((name) => [
      name,
      (...a: unknown[]) => actions[name as keyof typeof actions](...a),
    ])
  )
);

describe('PrCommentsSection', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('shows stored comments at once, then the fresh read from GitHub', async () => {
    actions.getPrComments.mockResolvedValue({ ok: true, ...PENDING_STATE });
    actions.refreshPrComments.mockResolvedValue({ ok: true, ...ADDRESSED_STATE });
    render(<PrCommentsSection featureId="feature-1" />);

    expect(await screen.findByTestId('pr-comment-301')).toHaveTextContent('@ada');
    expect(actions.getPrComments).toHaveBeenCalledWith('feature-1');
    await waitFor(() =>
      expect(screen.getByTestId('pr-comment-301')).toHaveTextContent('Renamed to totalCents')
    );
    expect(actions.refreshPrComments).toHaveBeenCalledWith('feature-1');
    expect(screen.getByText(/Last round pushed c0ffee1/)).toBeInTheDocument();
  });

  it('addresses the pending comments and polls while the round runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    actions.addressPrComments.mockResolvedValue({ ok: true, round: RUNNING_STATE.rounds[0] });
    actions.getPrComments
      .mockResolvedValueOnce({ ok: true, ...RUNNING_STATE })
      .mockResolvedValue({ ok: true, ...ADDRESSED_STATE });
    render(<PrCommentsSection featureId="feature-1" initial={PENDING_STATE} />);

    await userEvent.click(screen.getByRole('button', { name: 'Address 2 pending' }));
    expect(actions.addressPrComments).toHaveBeenCalledWith('feature-1');
    expect(await screen.findByText(/addressing 2 comments/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nothing to address' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PR_COMMENTS_POLL_MS);
    });
    expect(await screen.findByText(/Last round pushed/)).toBeInTheDocument();
  });

  it('shows a refusal', async () => {
    actions.addressPrComments.mockResolvedValue({
      ok: false,
      error: 'Refund guests is already addressing comments.',
    });
    render(<PrCommentsSection featureId="feature-1" initial={PENDING_STATE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Address 2 pending' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already addressing');
  });

  it('shows a failed round and lets the failed comments be addressed again', () => {
    render(<PrCommentsSection featureId="feature-1" initial={FAILED_STATE} />);
    expect(screen.getByText(/Last round failed: Could not push/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Address 1 pending' })).toBeEnabled();
  });

  it('reads GitHub again on refresh and says when there is nothing', async () => {
    actions.refreshPrComments.mockResolvedValue({ ok: true, comments: [], rounds: [] });
    render(<PrCommentsSection featureId="feature-1" initial={{ comments: [], rounds: [] }} />);
    expect(screen.getByText(/No review comments/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Read comments from GitHub' }));
    expect(actions.refreshPrComments).toHaveBeenCalledWith('feature-1');
    expect(actions.getPrComments).not.toHaveBeenCalled();
  });
});
