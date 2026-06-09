/**
 * AssetRiskGraph component tests (feature 098, phase 7, task-47).
 *
 * Uses the tabular fallback so the test environment doesn't need to
 * exercise the React Flow renderer (which requires a real DOM
 * resizable container that JSDOM doesn't provide).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AssetRiskGraph } from '@/components/features/aspm/asset-risk-graph/asset-risk-graph';

const applications = [
  { id: 'app-a', name: 'payments-service' },
  { id: 'app-b', name: 'checkout-web' },
];
const atRisk = [{ applicationId: 'app-a', openFindingCount: 5, riskScoreSum: 200 }];

describe('AssetRiskGraph', () => {
  it('renders the Loading state', () => {
    render(<AssetRiskGraph applications={[]} atRisk={[]} loading />);
    expect(screen.getByTestId('asset-risk-graph-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<AssetRiskGraph applications={[]} atRisk={[]} error="boom" />);
    expect(screen.getByTestId('asset-risk-graph-error')).toHaveTextContent('boom');
  });

  it('renders the Empty state with zero applications', () => {
    render(<AssetRiskGraph applications={[]} atRisk={[]} />);
    expect(screen.getByTestId('asset-risk-graph-empty')).toBeInTheDocument();
  });

  it('renders the tabular fallback when forceTabular is true', () => {
    render(<AssetRiskGraph applications={applications} atRisk={atRisk} forceTabular />);
    expect(screen.getByTestId('asset-risk-graph-tabular')).toBeInTheDocument();
    expect(screen.getByText('payments-service')).toBeInTheDocument();
    expect(screen.getByText('checkout-web')).toBeInTheDocument();
  });

  it('renders an open-finding count from the matched at-risk rollup', () => {
    render(<AssetRiskGraph applications={applications} atRisk={atRisk} forceTabular />);
    const row = screen.getByText('payments-service').closest('tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('5');
    expect(row!.textContent).toContain('200');
  });
});
