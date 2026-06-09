/**
 * AspmApplicationSection component tests (feature 098, phase 7, task-46).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  AspmApplicationSection,
  type AspmApplicationSectionView,
} from '@/components/features/aspm/aspm-application-section';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const now = new Date();

function finding(id: string): SecurityFinding {
  return {
    id,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: `r.${id}`,
    title: `Finding ${id}`,
    description: '',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:test',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  } as SecurityFinding;
}

const populated: AspmApplicationSectionView = {
  openBySeverity: [
    { severity: CanonicalSeverity.Critical, count: 1 },
    { severity: CanonicalSeverity.High, count: 2 },
    { severity: CanonicalSeverity.Medium, count: 0 },
    { severity: CanonicalSeverity.Low, count: 0 },
    { severity: CanonicalSeverity.Info, count: 0 },
  ],
  topFindings: [finding('a'), finding('b')],
  topRiskScoreTotal: 87,
  ownerCount: 1,
};

describe('AspmApplicationSection', () => {
  it('renders the Loading state', () => {
    render(<AspmApplicationSection applicationId="app-1" posture={null} loading />);
    expect(screen.getByTestId('aspm-app-section-loading-app-1')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<AspmApplicationSection applicationId="app-1" posture={null} error="boom" />);
    expect(screen.getByTestId('aspm-app-section-error-app-1')).toHaveTextContent('boom');
  });

  it('renders the Empty state on Applications without ASPM data', () => {
    render(<AspmApplicationSection applicationId="app-2" posture={null} />);
    expect(screen.getByTestId('aspm-app-section-empty-app-2')).toBeInTheDocument();
  });

  it('renders the populated view with badge + top score + findings', () => {
    render(<AspmApplicationSection applicationId="app-1" posture={populated} exceptionCount={1} />);
    expect(screen.getByTestId('aspm-app-section-app-1')).toBeInTheDocument();
    expect(screen.getByTestId('aspm-app-section-top-score')).toHaveTextContent('87');
    expect(screen.getByTestId('findings-table-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('findings-table-row-b')).toBeInTheDocument();
  });

  it('reports total + exception count in the header', () => {
    render(<AspmApplicationSection applicationId="app-1" posture={populated} exceptionCount={3} />);
    expect(screen.getByTestId('aspm-app-section-app-1').textContent).toContain('3 open');
    expect(screen.getByTestId('aspm-app-section-app-1').textContent).toContain(
      '3 active exceptions'
    );
  });

  it('omits the top score badge when no scores are available', () => {
    render(
      <AspmApplicationSection
        applicationId="app-1"
        posture={{ ...populated, topRiskScoreTotal: null }}
      />
    );
    expect(screen.queryByTestId('aspm-app-section-top-score')).toBeNull();
  });
});
