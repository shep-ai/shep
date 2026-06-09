/**
 * FindingDetailPanel component tests (feature 098, phase 5, task-30).
 *
 * Asserts the three first-class states + that the rendered finding
 * surface includes its metadata, severity, and the embedded
 * RiskScoreBreakdown.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { FindingDetailPanel } from '@/components/features/aspm/finding-detail-panel';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type RiskScoreBreakdown,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const now = new Date('2026-05-19T12:00:00Z');

function makeFinding(overrides: Partial<SecurityFinding>): SecurityFinding {
  return {
    id: 'f-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'r-1',
    title: 'Test finding',
    description: 'desc text',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SecurityFinding;
}

function makeBreakdown(overrides: Partial<RiskScoreBreakdown>): RiskScoreBreakdown {
  return {
    total: 50,
    cvssContribution: 30,
    epssContribution: 10,
    kevContribution: 0,
    exposureContribution: 5,
    criticalityContribution: 3,
    dataClassificationContribution: 2,
    ...overrides,
  };
}

describe('FindingDetailPanel', () => {
  it('renders loading state', () => {
    render(<FindingDetailPanel loading />);
    expect(screen.getByTestId('finding-detail-loading')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<FindingDetailPanel error="Boom" />);
    expect(screen.getByTestId('finding-detail-error')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders empty state when no finding is supplied', () => {
    render(<FindingDetailPanel />);
    expect(screen.getByTestId('finding-detail-empty')).toBeInTheDocument();
  });

  it('renders the finding title, severity, and description', () => {
    const finding = makeFinding({
      title: 'SQL injection in /api',
      description: 'long description here',
      canonicalSeverity: CanonicalSeverity.Critical,
    });
    render(
      <FindingDetailPanel finding={finding} riskScoreBreakdown={makeBreakdown({ total: 80 })} />
    );
    expect(screen.getByText('SQL injection in /api')).toBeInTheDocument();
    expect(screen.getByText('long description here')).toBeInTheDocument();
    expect(screen.getByTestId('severity-badge-critical')).toBeInTheDocument();
  });

  it('renders CVE / CWE / ASVS metadata when present', () => {
    const finding = makeFinding({
      cveId: 'CVE-2024-1234',
      cweId: 'CWE-89',
      owaspAsvsControlId: 'V5.3.4',
      locationPath: 'src/foo.ts',
      locationLine: 12,
    });
    render(<FindingDetailPanel finding={finding} riskScoreBreakdown={makeBreakdown({})} />);
    expect(screen.getByText('CVE-2024-1234')).toBeInTheDocument();
    expect(screen.getByText('CWE-89')).toBeInTheDocument();
    expect(screen.getByText('V5.3.4')).toBeInTheDocument();
    expect(screen.getByText('src/foo.ts:12')).toBeInTheDocument();
  });

  it('surfaces the KEV flag and EPSS percentile', () => {
    const finding = makeFinding({
      cveId: 'CVE-2024-9999',
      kev: true,
      epssPercentile: 0.94,
    });
    render(<FindingDetailPanel finding={finding} riskScoreBreakdown={makeBreakdown({})} />);
    expect(screen.getByText('Listed (CISA)')).toBeInTheDocument();
    expect(screen.getByText(/94\.0 percentile/)).toBeInTheDocument();
  });

  it('embeds the RiskScoreBreakdown when a breakdown is supplied', () => {
    const finding = makeFinding({});
    render(
      <FindingDetailPanel finding={finding} riskScoreBreakdown={makeBreakdown({ total: 88 })} />
    );
    expect(screen.getByTestId('risk-score-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-total')).toHaveTextContent('88');
  });

  it('shows the breakdown empty state when no breakdown is supplied', () => {
    const finding = makeFinding({});
    render(<FindingDetailPanel finding={finding} />);
    expect(screen.getByTestId('risk-score-breakdown-empty')).toBeInTheDocument();
  });

  it('wires Compute now to the onComputeRiskScore override', async () => {
    const finding = makeFinding({ id: 'finding-xyz' });
    const compute = vi.fn(async () => undefined);
    render(<FindingDetailPanel finding={finding} onComputeRiskScore={compute} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('risk-score-compute-now'));
    });

    expect(compute).toHaveBeenCalledWith('finding-xyz');
  });
});
