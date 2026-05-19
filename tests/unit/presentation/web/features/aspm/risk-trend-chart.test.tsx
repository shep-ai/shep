/**
 * RiskTrendChart component tests (feature 098, phase 7, task-43).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RiskTrendChart, type TrendChartBucket } from '@/components/features/aspm/risk-trend-chart';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

function bucket(iso: string, critical: number, high: number): TrendChartBucket {
  return {
    bucketStart: iso,
    countsBySeverity: [
      { severity: CanonicalSeverity.Critical, count: critical },
      { severity: CanonicalSeverity.High, count: high },
      { severity: CanonicalSeverity.Medium, count: 0 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
  };
}

describe('RiskTrendChart', () => {
  it('renders the Loading state', () => {
    render(<RiskTrendChart loading />);
    expect(screen.getByTestId('risk-trend-chart-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<RiskTrendChart error="boom" />);
    expect(screen.getByTestId('risk-trend-chart-error')).toHaveTextContent('boom');
  });

  it('renders the Empty state when no buckets are supplied', () => {
    render(<RiskTrendChart buckets={[]} />);
    expect(screen.getByTestId('risk-trend-chart-empty')).toBeInTheDocument();
  });

  it('renders one polyline per visible severity', () => {
    render(
      <RiskTrendChart
        buckets={[bucket('2026-05-17T00:00:00Z', 1, 2), bucket('2026-05-18T00:00:00Z', 2, 3)]}
      />
    );
    for (const sev of [
      CanonicalSeverity.Critical,
      CanonicalSeverity.High,
      CanonicalSeverity.Medium,
      CanonicalSeverity.Low,
      CanonicalSeverity.Info,
    ]) {
      expect(screen.getByTestId(`risk-trend-line-${sev.toLowerCase()}`)).toBeInTheDocument();
    }
  });

  it('honors visibleSeverities by hiding non-selected lines', () => {
    render(
      <RiskTrendChart
        buckets={[bucket('2026-05-18T00:00:00Z', 1, 2)]}
        visibleSeverities={[CanonicalSeverity.Critical]}
      />
    );
    expect(screen.getByTestId('risk-trend-line-critical')).toBeInTheDocument();
    expect(screen.queryByTestId('risk-trend-line-high')).toBeNull();
  });
});
