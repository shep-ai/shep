/**
 * PostureCards component tests (feature 098, phase 7, task-43).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PostureCards, type PostureSummaryView } from '@/components/features/aspm/posture-cards';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const populated: PostureSummaryView = {
  openBySeverity: [
    { severity: CanonicalSeverity.Critical, count: 3 },
    { severity: CanonicalSeverity.High, count: 7 },
    { severity: CanonicalSeverity.Medium, count: 12 },
    { severity: CanonicalSeverity.Low, count: 4 },
    { severity: CanonicalSeverity.Info, count: 0 },
  ],
  topAtRiskApplications: [],
  kevOpenCount: 2,
  slaBreachCount: 4,
  exceptionCount: 1,
  aiReviewQueueDepth: 5,
  lastIngestedAt: '2026-05-18T09:00:00.000Z',
};

describe('PostureCards', () => {
  it('renders the Loading state', () => {
    render(<PostureCards loading />);
    expect(screen.getByTestId('posture-cards-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<PostureCards error="boom" />);
    expect(screen.getByTestId('posture-cards-error')).toHaveTextContent('boom');
  });

  it('renders the Empty state when summary is null', () => {
    render(<PostureCards summary={null} />);
    expect(screen.getByTestId('posture-cards-empty')).toBeInTheDocument();
  });

  it('renders one severity tile per canonical severity', () => {
    render(<PostureCards summary={populated} />);
    for (const sev of [
      CanonicalSeverity.Critical,
      CanonicalSeverity.High,
      CanonicalSeverity.Medium,
      CanonicalSeverity.Low,
      CanonicalSeverity.Info,
    ]) {
      expect(screen.getByTestId(`posture-tile-${sev.toLowerCase()}`)).toBeInTheDocument();
    }
  });

  it('shows the KEV / SLA / exception / AI-review / last-ingested tiles', () => {
    render(<PostureCards summary={populated} />);
    expect(screen.getByTestId('kpi-tile-kev')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-tile-sla-breach')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-tile-exceptions')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-tile-ai-review')).toHaveTextContent('5');
    expect(screen.getByTestId('kpi-tile-last-ingested')).toHaveTextContent('2026-05-18');
  });

  it('shows "Never" when lastIngestedAt is null', () => {
    render(<PostureCards summary={{ ...populated, lastIngestedAt: null }} />);
    expect(screen.getByTestId('kpi-tile-last-ingested')).toHaveTextContent('Never');
  });
});
