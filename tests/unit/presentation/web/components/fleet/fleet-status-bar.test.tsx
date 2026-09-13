/**
 * FleetStatusBar — unit tests (spec 111).
 *
 * The bar is the operator's whole view of a large fleet, so the contract that
 * matters is: report the exception count, stay quiet about zeros, and never
 * render a stale number while loading.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FleetStatusBar } from '@/components/fleet/fleet-status-bar';
import type { FleetStatusCounts } from '@shepai/core/domain/generated/output';

const COUNTS: FleetStatusCounts = {
  total: 52,
  cruising: 42,
  queued: 5,
  attentionNeeded: 3,
  failed: 2,
  waitingApproval: 3,
  blockedQuestions: 1,
};

describe('FleetStatusBar', () => {
  it('renders every count for a mixed fleet', () => {
    render(<FleetStatusBar counts={COUNTS} />);

    expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('fleet-count-cruising')).toHaveTextContent('42');
    expect(screen.getByTestId('fleet-count-queued')).toHaveTextContent('5');
    expect(screen.getByTestId('fleet-count-attention')).toHaveTextContent('3');
    expect(screen.getByTestId('fleet-count-failed')).toHaveTextContent('2');
  });

  it('shows the circuit breaker badge only when tripped', () => {
    const { rerender } = render(<FleetStatusBar counts={COUNTS} />);
    expect(screen.queryByTestId('fleet-circuit-breaker')).not.toBeInTheDocument();

    rerender(<FleetStatusBar counts={COUNTS} circuitBreakerTripped circuitBreakerReason="4/4" />);
    expect(screen.getByTestId('fleet-circuit-breaker')).toHaveTextContent('breaker tripped');
  });

  it('states that the fleet is empty rather than showing zeroes', () => {
    render(
      <FleetStatusBar
        counts={{ ...COUNTS, total: 0, cruising: 0, queued: 0, attentionNeeded: 0, failed: 0 }}
      />
    );

    expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByTestId('fleet-status-bar')).toHaveTextContent('No active features');
  });

  it('replaces the counts with a busy placeholder while loading', () => {
    render(<FleetStatusBar state="loading" counts={COUNTS} />);

    const bar = screen.getByTestId('fleet-status-bar');
    expect(bar).toHaveAttribute('data-state', 'loading');
    expect(bar).toHaveAttribute('aria-busy', 'true');
    // Loading must not leak a stale number.
    expect(bar).not.toHaveTextContent('42');
  });

  it('offers a retry when the fleet could not be read', async () => {
    const onRetry = vi.fn();
    render(<FleetStatusBar state="error" errorMessage="container unavailable" onRetry={onRetry} />);

    expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'error');
    expect(screen.getByText(/container unavailable/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens triage from the bar and labels the button with the attention count', async () => {
    const onOpenTriage = vi.fn();
    render(<FleetStatusBar counts={COUNTS} onOpenTriage={onOpenTriage} />);

    const button = screen.getByTestId('fleet-open-triage');
    expect(button).toHaveTextContent('Triage (3)');

    await userEvent.click(button);
    expect(onOpenTriage).toHaveBeenCalledTimes(1);
  });

  it('omits the triage control when the host supplies no handler', () => {
    render(<FleetStatusBar counts={COUNTS} />);
    expect(screen.queryByTestId('fleet-open-triage')).not.toBeInTheDocument();
  });
});
