/**
 * CampaignBoard component tests (feature 098, phase 6, task-39).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CampaignBoard, type CampaignBoardItem } from '@/components/features/aspm/campaign-board';
import {
  CampaignStatus,
  CanonicalSeverity,
  type RemediationCampaign,
} from '@shepai/core/domain/generated/output';

const APP_A = 'aaaa-aaaa';
const APP_B = 'bbbb-bbbb';

function campaign(
  overrides: Partial<RemediationCampaign> & { id: string; name: string }
): RemediationCampaign {
  return {
    description: '',
    targetQuery: {},
    status: CampaignStatus.Active,
    createdAt: new Date('2026-05-19T00:00:00Z'),
    updatedAt: new Date('2026-05-19T00:00:00Z'),
    ...overrides,
  };
}

const items: CampaignBoardItem[] = [
  {
    campaign: campaign({
      id: 'c-1',
      name: 'Fix all KEV',
      targetQuery: { severities: [CanonicalSeverity.Critical], kev: true },
    }),
    progress: { total: 10, closed: 4, atRisk: 3, blocked: 1 },
  },
  {
    campaign: campaign({
      id: 'c-2',
      name: 'Payments hardening',
      targetQuery: { applicationIds: [APP_A] },
      status: CampaignStatus.Draft,
    }),
    progress: { total: 0, closed: 0, atRisk: 0, blocked: 0 },
  },
];

describe('CampaignBoard', () => {
  it('renders loading state', () => {
    render(<CampaignBoard items={[]} loading />);
    expect(screen.getByTestId('campaign-board-loading')).toBeInTheDocument();
  });

  it('renders error state with the message', () => {
    render(<CampaignBoard items={[]} error="boom" />);
    expect(screen.getByTestId('campaign-board-error')).toHaveTextContent('boom');
  });

  it('renders empty state when items are []', () => {
    render(<CampaignBoard items={[]} />);
    expect(screen.getByTestId('campaign-board-empty')).toBeInTheDocument();
  });

  it('renders one card per campaign with status, progress and link', () => {
    render(<CampaignBoard items={items} />);
    expect(screen.getByTestId('campaign-card-c-1')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-card-c-2')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-card-c-1-progress-bar')).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    expect(screen.getByTestId('campaign-card-c-1-status')).toHaveTextContent('Active');
    expect(screen.getByTestId('campaign-card-c-1-findings-link')).toHaveAttribute(
      'href',
      '/aspm/findings?campaign=c-1'
    );
  });

  it('shows "Progress unavailable" when no progress is supplied', () => {
    render(<CampaignBoard items={[{ campaign: items[0].campaign, progress: null }]} />);
    expect(screen.getByTestId('campaign-card-c-1-progress-pending')).toBeInTheDocument();
  });

  it('filters by application — keeps cards whose targetQuery matches and drops the rest', () => {
    render(<CampaignBoard items={items} applicationFilter={APP_A} />);
    expect(screen.queryByTestId('campaign-card-c-1')).toBeInTheDocument(); // empty applicationIds → all
    expect(screen.queryByTestId('campaign-card-c-2')).toBeInTheDocument(); // includes APP_A
  });

  it('filters by application — drops cards whose targetQuery does not include the filter id', () => {
    render(<CampaignBoard items={items} applicationFilter={APP_B} />);
    expect(screen.queryByTestId('campaign-card-c-2')).not.toBeInTheDocument();
  });

  it('honors a custom buildFindingsHref', () => {
    render(
      <CampaignBoard items={[items[0]]} buildFindingsHref={(c) => `/custom/${c.id}` as never} />
    );
    expect(screen.getByTestId('campaign-card-c-1-findings-link')).toHaveAttribute(
      'href',
      '/custom/c-1'
    );
  });

  it('renders at-risk and blocked badges only when counts > 0', () => {
    render(<CampaignBoard items={items} />);
    expect(screen.getByLabelText('3 at risk')).toBeInTheDocument();
    expect(screen.getByLabelText('1 blocked')).toBeInTheDocument();
    // c-2 has zero of both
    expect(screen.queryByLabelText(/0 at risk/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/0 blocked/)).not.toBeInTheDocument();
  });
});
