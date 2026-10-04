import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  OpportunityStatus,
  SignalKind,
  type Opportunity,
} from '@shepai/core/domain/generated/output';
import type { OpportunityBoard } from '@shepai/core/application/use-cases/opportunities/get-opportunity-board.use-case';
import { OpportunitiesPageClient } from '@/components/features/opportunities/opportunities-page-client';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const actions = vi.hoisted(() => ({
  recordSignal: vi.fn(),
  linkSignal: vi.fn(),
  removeSignal: vi.fn(),
  createOpportunity: vi.fn(),
  estimateOpportunity: vi.fn(),
  acceptOpportunity: vi.fn(),
  dropOpportunity: vi.fn(),
  buildOpportunity: vi.fn(),
  setOpportunityWeights: vi.fn(),
}));
vi.mock('@/app/actions/manage-opportunities', () =>
  Object.fromEntries(
    Object.keys(actions).map((name) => [
      name,
      (...a: unknown[]) => actions[name as keyof typeof actions](...a),
    ])
  )
);

const T = new Date('2026-10-05T10:00:00Z');
function bet(id: string, status: OpportunityStatus, extra: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    spaceId: 's-acme',
    title: id,
    status,
    reviewHours: 4,
    confidence: 0.5,
    strategic: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}
const evidence = { signals: 2, customers: 2, revenueAtStake: 4000, urgentSignals: 1 };
const CHECKOUT = {
  opportunity: bet('checkout', OpportunityStatus.Accepted, { strategic: true }),
  evidence,
  value: 13,
  score: 1.625,
};
const IDEA = {
  opportunity: bet('idea', OpportunityStatus.Proposed),
  evidence,
  value: 4,
  score: 0.5,
};
const BOARD: OpportunityBoard = {
  space: { id: 's-acme', name: 'Acme', slug: 'acme' },
  weights: {
    spaceId: 's-acme',
    reach: 1,
    revenue: 2,
    urgency: 3,
    strategic: 5,
    weeklyReviewHours: 10,
  },
  ranked: [CHECKOUT, IDEA],
  line: { inLine: [CHECKOUT], waiting: [], usedHours: 4, capacityHours: 10 },
  unlinkedSignals: [
    {
      id: 'sig-1',
      spaceId: 's-acme',
      kind: SignalKind.Feedback,
      title: 'Dark mode',
      customer: 'Globex',
      monthlyRevenue: 900,
      urgent: true,
      createdAt: T,
      updatedAt: T,
    },
  ],
  decided: [],
};
const OPTIONS = {
  spaces: [
    { id: 's-me', name: 'Personal', slug: 'personal' },
    { id: 's-acme', name: 'Acme', slug: 'acme' },
  ],
  productLines: [{ id: 'pl-pay', name: 'Payments' }],
  projects: [{ id: 'p-pay', name: 'Payments' }],
};

describe('OpportunitiesPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('shows the capacity, the ranked bets with their evidence and the line', () => {
    render(<OpportunitiesPageClient board={BOARD} options={OPTIONS} />);
    expect(screen.getByText('4 of 10 review hours')).toBeInTheDocument();
    const row = within(screen.getByTestId('opportunity-checkout'));
    expect(row.getByText('1.63')).toBeInTheDocument();
    expect(row.getByText(/2 signals · 2 customers · 4000\/month · 1 urgent/)).toBeInTheDocument();
    expect(row.getByLabelText('In this week’s line')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('opportunity-idea')).getByLabelText('Not in the line')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Personal' })).toHaveAttribute(
      'href',
      '/opportunities?space=personal'
    );
  });

  it('accepts a proposal, drops with a reason and builds into a project', async () => {
    render(<OpportunitiesPageClient board={BOARD} options={OPTIONS} />);
    await userEvent.click(screen.getByTestId('opportunity-accept-idea'));
    expect(actions.acceptOpportunity).toHaveBeenCalledWith('idea');

    await userEvent.click(screen.getByTestId('opportunity-drop-idea'));
    await userEvent.type(screen.getByTestId('opportunity-drop-reason-idea'), 'Not now');
    await userEvent.click(
      within(screen.getByTestId('opportunity-idea')).getByRole('button', { name: 'Drop' })
    );
    expect(actions.dropOpportunity).toHaveBeenCalledWith('idea', 'Not now');

    await userEvent.click(screen.getByTestId('opportunity-build-checkout'));
    await userEvent.click(
      within(screen.getByTestId('opportunity-checkout')).getByRole('button', { name: 'Build' })
    );
    expect(actions.buildOpportunity).toHaveBeenCalledWith('checkout', 'p-pay');
    expect(refresh).toHaveBeenCalled();
  });

  it('records a signal and links a loose one', async () => {
    render(<OpportunitiesPageClient board={BOARD} options={OPTIONS} />);
    await userEvent.type(screen.getByTestId('add-signal-title'), 'Export to CSV');
    await userEvent.type(screen.getByTestId('add-signal-customer'), 'Initech');
    await userEvent.type(screen.getByTestId('add-signal-revenue'), '1500');
    await userEvent.click(screen.getByTestId('add-signal-urgent'));
    await userEvent.click(screen.getByTestId('add-signal-submit'));
    expect(actions.recordSignal).toHaveBeenCalledWith({
      space: 's-acme',
      title: 'Export to CSV',
      kind: SignalKind.Feedback,
      customer: 'Initech',
      monthlyRevenue: 1500,
      urgent: true,
    });

    await userEvent.selectOptions(screen.getByTestId('signal-link-sig-1'), 'checkout');
    expect(actions.linkSignal).toHaveBeenCalledWith('sig-1', 'checkout');
  });

  it('shapes an opportunity and saves weights', async () => {
    render(<OpportunitiesPageClient board={BOARD} options={OPTIONS} />);
    await userEvent.type(screen.getByTestId('add-opportunity-title'), 'SSO');
    await userEvent.clear(screen.getByTestId('add-opportunity-hours'));
    await userEvent.type(screen.getByTestId('add-opportunity-hours'), '12');
    await userEvent.selectOptions(screen.getByTestId('add-opportunity-product-line'), 'pl-pay');
    await userEvent.click(screen.getByTestId('add-opportunity-strategic'));
    await userEvent.click(screen.getByTestId('add-opportunity-submit'));
    expect(actions.createOpportunity).toHaveBeenCalledWith({
      space: 's-acme',
      title: 'SSO',
      reviewHours: 12,
      confidence: 0.5,
      strategic: true,
      productLine: 'pl-pay',
    });

    await userEvent.clear(screen.getByTestId('weights-weeklyReviewHours'));
    await userEvent.type(screen.getByTestId('weights-weeklyReviewHours'), '15');
    await userEvent.click(screen.getByTestId('weights-submit'));
    expect(actions.setOpportunityWeights).toHaveBeenCalledWith('s-acme', {
      reach: 1,
      revenue: 2,
      urgency: 3,
      strategic: 5,
      weeklyReviewHours: 15,
    });
  });

  it('shows a refusal, the empty state and a load error', async () => {
    actions.acceptOpportunity.mockResolvedValue({ ok: false, error: 'idea is Dropped' });
    const { unmount } = render(<OpportunitiesPageClient board={BOARD} options={OPTIONS} />);
    await userEvent.click(screen.getByTestId('opportunity-accept-idea'));
    expect(await screen.findByRole('alert')).toHaveTextContent('idea is Dropped');
    unmount();

    render(<OpportunitiesPageClient board={{ ...BOARD, ranked: [] }} options={OPTIONS} />);
    expect(screen.getByTestId('opportunities-empty')).toBeInTheDocument();
  });

  it('shows why the board could not load', () => {
    render(<OpportunitiesPageClient options={OPTIONS} loadError='No space "nope".' />);
    expect(screen.getByRole('alert')).toHaveTextContent('No space');
  });
});
