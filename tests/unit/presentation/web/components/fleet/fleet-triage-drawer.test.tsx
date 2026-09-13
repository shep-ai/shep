/**
 * FleetTriageDrawer — unit tests (spec 111).
 *
 * The drawer's job is to show only exceptions and to make each one actionable
 * without the operator having to look anything up.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FleetTriageDrawer } from '@/components/fleet/fleet-triage-drawer';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

const NOW = '2026-09-11T12:00:00.000Z';

/** The drawer is controlled; most cases never change `open`. */
const noop = (): void => undefined;

function item(overrides: Partial<FleetTriageItem> = {}): FleetTriageItem {
  return {
    featureId: 'feat-1',
    featureName: 'Needs Plan Approval',
    slug: 'needs-plan',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.gate,
    reason: 'Waiting on the plan approval gate',
    runId: 'run-1',
    gateType: 'plan',
    createdAt: NOW,
    ...overrides,
  };
}

describe('FleetTriageDrawer', () => {
  it('renders nothing to act on as a healthy fleet, not an empty list', () => {
    render(<FleetTriageDrawer items={[]} open onOpenChange={noop} />);

    expect(screen.getByTestId('fleet-triage-empty')).toHaveTextContent(
      'Nothing needs you right now.'
    );
    expect(screen.queryAllByTestId('fleet-triage-item')).toHaveLength(0);
  });

  it('renders one row per exception with its reason and category', () => {
    render(
      <FleetTriageDrawer
        items={[
          item(),
          item({
            featureId: 'feat-2',
            featureName: 'CSV Export',
            slug: 'csv-export',
            priority: FleetTriagePriority.p2,
            category: FleetTriageCategory.ci_failed,
            reason: 'CI is failing on the pull request',
            runId: 'run-2',
          }),
        ]}
        open
        onOpenChange={noop}
      />
    );

    expect(screen.getAllByTestId('fleet-triage-item')).toHaveLength(2);
    expect(screen.getByText('Waiting on the plan approval gate')).toBeInTheDocument();
    expect(screen.getByText('CI is failing on the pull request')).toBeInTheDocument();
    expect(screen.getByText('Approval gate')).toBeInTheDocument();
    expect(screen.getByText('CI failed')).toBeInTheDocument();
  });

  it('gives gate rows the exact command that resolves them', () => {
    render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

    expect(screen.getByText('shep feat approve needs-plan')).toBeInTheDocument();
  });

  it('does not suggest an approve command for a non-gate row', () => {
    render(
      <FleetTriageDrawer
        items={[
          item({
            category: FleetTriageCategory.ci_failed,
            reason: 'CI is failing on the pull request',
          }),
        ]}
        open
        onOpenChange={noop}
      />
    );

    expect(screen.queryByText(/shep feat approve/)).not.toBeInTheDocument();
  });

  it('summarises the item count in the title', () => {
    render(
      <FleetTriageDrawer items={[item(), item({ featureId: 'f2' })]} open onOpenChange={noop} />
    );
    expect(screen.getByText('Fleet triage — 2 items')).toBeInTheDocument();
  });

  it('reports a refresh in flight and wires the refresh handler', () => {
    const onRefresh = vi.fn();
    render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={onRefresh} />);

    // `fireEvent` rather than `userEvent`: the drawer body sits inside vaul's
    // drag surface, and userEvent's synthetic pointer sequence trips its
    // transform maths under jsdom.
    fireEvent.click(screen.getByTestId('fleet-triage-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh while one is already running', () => {
    render(
      <FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={noop} refreshing />
    );

    expect(screen.getByTestId('fleet-triage-refresh')).toBeDisabled();
    expect(screen.getByTestId('fleet-triage-refresh')).toHaveTextContent('Refreshing…');
  });
});
