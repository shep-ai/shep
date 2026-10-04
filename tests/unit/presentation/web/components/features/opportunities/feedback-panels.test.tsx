import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignalKind, type Signal } from '@shepai/core/domain/generated/output';
import { FeedbackThemes } from '@/components/features/opportunities/feedback-themes';
import { FeedbackKeysPanel } from '@/components/features/opportunities/feedback-keys-panel';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  createFeedbackKey: vi.fn(),
  revokeFeedbackKey: vi.fn(),
  promoteTheme: vi.fn(),
}));
vi.mock('@/app/actions/manage-feedback', () => ({
  createFeedbackKey: (...a: unknown[]) => actions.createFeedbackKey(...a),
  revokeFeedbackKey: (...a: unknown[]) => actions.revokeFeedbackKey(...a),
  promoteTheme: (...a: unknown[]) => actions.promoteTheme(...a),
}));

const T = new Date('2026-10-05T10:00:00Z');
const signal = (id: string, title: string): Signal => ({
  id,
  spaceId: 's-acme',
  kind: SignalKind.Feedback,
  title,
  urgent: false,
  createdAt: T,
  updatedAt: T,
});
const THEME = {
  key: 'sig-1',
  label: 'checkout guest timeout',
  signals: [signal('sig-1', 'Guest checkout times out'), signal('sig-2', 'Checkout timeout')],
  evidence: { signals: 2, customers: 2, revenueAtStake: 5000, urgentSignals: 1 },
};
const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('FeedbackThemes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each theme with its evidence and promotes it with an estimate', async () => {
    actions.promoteTheme.mockResolvedValue({ ok: true });
    render(<FeedbackThemes spaceId="s-acme" themes={[THEME]} run={run} />);
    const theme = within(screen.getByTestId('feedback-theme-sig-1'));
    expect(theme.getByText('checkout guest timeout')).toBeInTheDocument();
    expect(theme.getByText(/2 signals · 2 customers · 5000\/month · 1 urgent/)).toBeInTheDocument();
    expect(theme.getByText('Guest checkout times out')).toBeInTheDocument();
    await userEvent.clear(theme.getByTestId('feedback-theme-hours-sig-1'));
    await userEvent.type(theme.getByTestId('feedback-theme-hours-sig-1'), '6');
    await userEvent.click(theme.getByTestId('feedback-theme-promote-sig-1'));
    expect(actions.promoteTheme).toHaveBeenCalledWith({
      space: 's-acme',
      theme: 'sig-1',
      reviewHours: 6,
    });
  });

  it('says when there are no themes', () => {
    render(<FeedbackThemes spaceId="s-acme" themes={[]} run={run} />);
    expect(screen.getByTestId('feedback-themes-empty')).toBeInTheDocument();
  });
});

describe('FeedbackKeysPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  const KEYS = [
    {
      id: 'k1',
      spaceId: 's-acme',
      name: 'Zendesk',
      prefix: 'shep_fb_abcd',
      lastUsedAt: T,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: 'k2',
      spaceId: 's-acme',
      name: 'Old',
      prefix: 'shep_fb_efgh',
      revokedAt: T,
      createdAt: T,
      updatedAt: T,
    },
  ];

  it('creates a key and shows its secret once', async () => {
    actions.createFeedbackKey.mockResolvedValue({ ok: true, secret: 'shep_fb_new-secret' });
    render(<FeedbackKeysPanel spaceId="s-acme" keys={KEYS} run={run} />);
    await userEvent.type(screen.getByTestId('feedback-key-name'), 'Intercom');
    await userEvent.click(screen.getByTestId('feedback-key-create'));
    expect(actions.createFeedbackKey).toHaveBeenCalledWith('s-acme', 'Intercom');
    expect(await screen.findByTestId('feedback-key-secret')).toHaveTextContent(
      'shep_fb_new-secret'
    );
    expect(screen.getByText(/POST \/api\/feedback/)).toBeInTheDocument();
  });

  it('shows a refusal to create and revokes an active key only', async () => {
    actions.createFeedbackKey.mockResolvedValue({ ok: false, error: 'No space "x".' });
    actions.revokeFeedbackKey.mockResolvedValue({ ok: true });
    render(<FeedbackKeysPanel spaceId="s-acme" keys={KEYS} run={run} />);
    await userEvent.type(screen.getByTestId('feedback-key-name'), 'X');
    await userEvent.click(screen.getByTestId('feedback-key-create'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No space');
    expect(screen.queryByTestId('feedback-key-secret')).not.toBeInTheDocument();

    expect(screen.getByText('shep_fb_abcd…')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-key-revoke-k2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('feedback-key-revoke-k1'));
    expect(actions.revokeFeedbackKey).toHaveBeenCalledWith('k1');
  });
});
