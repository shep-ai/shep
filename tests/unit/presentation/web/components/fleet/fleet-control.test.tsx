/**
 * FleetControl — unit tests (spec 111).
 *
 * The container owns three behaviours that are easy to get wrong: hide itself
 * when there is no fleet, fall back to loading on the client when the server
 * could not supply a snapshot, and surface a retry instead of a blank corner
 * when the read fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FleetControl } from '@/components/fleet/fleet-control';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetOverview,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

const getFleetData = vi.fn();

vi.mock('@/app/actions/fleet-data', () => ({
  getFleetData: (...args: unknown[]) => getFleetData(...args),
}));

const NOW = '2026-09-11T12:00:00.000Z';

const OVERVIEW: FleetOverview = {
  counts: {
    total: 52,
    cruising: 42,
    queued: 5,
    attentionNeeded: 2,
    failed: 1,
    waitingApproval: 2,
    blockedQuestions: 0,
  },
  circuitBreakerTripped: false,
  activeTriageCount: 1,
  consecutiveFailures: 0,
  timestamp: NOW,
};

const ITEMS: FleetTriageItem[] = [
  {
    featureId: 'feat-1',
    featureName: 'Needs Plan Approval',
    slug: 'needs-plan',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.gate,
    reason: 'Waiting on the plan approval gate',
    runId: 'run-1',
    gateType: 'plan',
    createdAt: NOW,
  },
];

describe('FleetControl', () => {
  beforeEach(() => {
    getFleetData.mockReset();
  });

  it('paints the server snapshot without calling the action', () => {
    render(<FleetControl initialData={{ overview: OVERVIEW, triageItems: ITEMS }} />);

    expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('fleet-count-attention')).toHaveTextContent('2');
    expect(getFleetData).not.toHaveBeenCalled();
  });

  it('renders nothing at all when the fleet has no features', () => {
    const { container } = render(
      <FleetControl
        initialData={{
          overview: {
            ...OVERVIEW,
            counts: {
              total: 0,
              cruising: 0,
              queued: 0,
              attentionNeeded: 0,
              failed: 0,
              waitingApproval: 0,
              blockedQuestions: 0,
            },
          },
          triageItems: [],
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('loads on the client when the server supplied no snapshot', async () => {
    getFleetData.mockResolvedValue({ overview: OVERVIEW, triageItems: ITEMS });

    render(<FleetControl />);

    expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'loading');
    await waitFor(() =>
      expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'ready')
    );
    expect(getFleetData).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error instead of a blank corner when the read fails', async () => {
    getFleetData.mockRejectedValueOnce(new Error('container unavailable'));
    getFleetData.mockResolvedValueOnce({ overview: OVERVIEW, triageItems: ITEMS });

    render(<FleetControl />);

    await waitFor(() =>
      expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'error')
    );
    expect(screen.getByText(/container unavailable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByTestId('fleet-status-bar')).toHaveAttribute('data-state', 'ready')
    );
  });

  it('opens the triage drawer from the bar', async () => {
    render(<FleetControl initialData={{ overview: OVERVIEW, triageItems: ITEMS }} />);

    fireEvent.click(screen.getByTestId('fleet-open-triage'));

    await waitFor(() =>
      expect(screen.getByText('Waiting on the plan approval gate')).toBeInTheDocument()
    );
  });
});
