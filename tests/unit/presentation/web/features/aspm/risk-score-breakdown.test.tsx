/**
 * RiskScoreBreakdown component tests (feature 098, phase 5, task-30).
 *
 * Asserts the three first-class states (Default / Loading / Error) and
 * that the bar rows reflect the breakdown contributions correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { RiskScoreBreakdown } from '@/components/features/aspm/risk-score-breakdown';
import type { RiskScoreBreakdown as Breakdown } from '@shepai/core/domain/generated/output';

function bd(overrides: Partial<Breakdown>): Breakdown {
  return {
    total: 0,
    cvssContribution: 0,
    epssContribution: 0,
    kevContribution: 0,
    exposureContribution: 0,
    criticalityContribution: 0,
    dataClassificationContribution: 0,
    ...overrides,
  };
}

describe('RiskScoreBreakdown', () => {
  it('renders loading state', () => {
    render(<RiskScoreBreakdown loading />);
    expect(screen.getByTestId('risk-score-breakdown-loading')).toBeInTheDocument();
    expect(screen.getByText(/computing risk score/i)).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<RiskScoreBreakdown error="Boom" />);
    expect(screen.getByTestId('risk-score-breakdown-error')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders empty state when breakdown is missing', () => {
    render(<RiskScoreBreakdown />);
    expect(screen.getByTestId('risk-score-breakdown-empty')).toBeInTheDocument();
  });

  it('hides the Compute now button when no onCompute handler is provided', () => {
    render(<RiskScoreBreakdown />);
    expect(screen.queryByTestId('risk-score-compute-now')).not.toBeInTheDocument();
  });

  it('renders a Compute now button when onCompute is provided', () => {
    render(<RiskScoreBreakdown onCompute={vi.fn(async () => undefined)} />);
    const button = screen.getByTestId('risk-score-compute-now');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(/compute now/i);
    expect(button).not.toBeDisabled();
  });

  it('shows a busy state and invokes onCompute on click', async () => {
    let resolveCompute!: () => void;
    const onCompute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCompute = resolve;
        })
    );
    render(<RiskScoreBreakdown onCompute={onCompute} />);

    fireEvent.click(screen.getByTestId('risk-score-compute-now'));

    expect(onCompute).toHaveBeenCalledTimes(1);
    const busyButton = screen.getByTestId('risk-score-compute-now');
    expect(busyButton).toHaveTextContent(/computing/i);
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveCompute();
    });
    expect(screen.getByTestId('risk-score-compute-now')).not.toBeDisabled();
  });

  it('surfaces a compute error inline', async () => {
    const onCompute = vi.fn(async () => {
      throw new Error('boom');
    });
    render(<RiskScoreBreakdown onCompute={onCompute} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('risk-score-compute-now'));
    });

    expect(screen.getByTestId('risk-score-compute-error')).toHaveTextContent('boom');
    expect(screen.getByTestId('risk-score-compute-now')).not.toBeDisabled();
  });

  it('renders the total prominently', () => {
    render(<RiskScoreBreakdown breakdown={bd({ total: 72 })} />);
    const total = screen.getByTestId('risk-score-total');
    expect(total).toHaveTextContent('72');
    expect(total).toHaveAttribute('aria-label', 'Total risk score: 72 of 100');
  });

  it('renders a row per dimension', () => {
    render(<RiskScoreBreakdown breakdown={bd({ total: 50 })} />);
    expect(screen.getByTestId('risk-score-row-cvss')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-row-epss')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-row-kev')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-row-exposure')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-row-criticality')).toBeInTheDocument();
    expect(screen.getByTestId('risk-score-row-data-class')).toBeInTheDocument();
  });

  it('shows the contribution values from the breakdown', () => {
    render(
      <RiskScoreBreakdown
        breakdown={bd({
          total: 95,
          cvssContribution: 35,
          epssContribution: 13.5,
          kevContribution: 20,
        })}
      />
    );
    expect(screen.getByTestId('risk-score-row-kev')).toHaveTextContent('20.00');
    expect(screen.getByTestId('risk-score-row-cvss')).toHaveTextContent('35.00');
    expect(screen.getByTestId('risk-score-row-epss')).toHaveTextContent('13.50');
  });
});
