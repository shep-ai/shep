/**
 * OwnerMap component tests (feature 098, phase 7, task-48).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OwnerMap, type OwnerRollup } from '@/components/features/aspm/owner-map';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

function row(overrides: Partial<OwnerRollup>): OwnerRollup {
  return {
    ownerId: 'o',
    ownerName: 'O',
    openFindingCount: 0,
    severityCounts: [
      { severity: CanonicalSeverity.Critical, count: 0 },
      { severity: CanonicalSeverity.High, count: 0 },
      { severity: CanonicalSeverity.Medium, count: 0 },
      { severity: CanonicalSeverity.Low, count: 0 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
    ...overrides,
  };
}

describe('OwnerMap', () => {
  it('renders the Loading state', () => {
    render(<OwnerMap loading />);
    expect(screen.getByTestId('owner-map-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<OwnerMap error="boom" />);
    expect(screen.getByTestId('owner-map-error')).toHaveTextContent('boom');
  });

  it('renders the Empty state when no owners', () => {
    render(<OwnerMap owners={[]} />);
    expect(screen.getByTestId('owner-map-empty')).toBeInTheDocument();
  });

  it('groups owners by business unit → team', () => {
    render(
      <OwnerMap
        owners={[
          row({
            ownerId: 'a',
            ownerName: 'Alice',
            teamName: 'Payments',
            businessUnitName: 'Commerce',
          }),
          row({
            ownerId: 'b',
            ownerName: 'Bob',
            teamName: 'Payments',
            businessUnitName: 'Commerce',
          }),
          row({
            ownerId: 'c',
            ownerName: 'Charlie',
            teamName: 'Platform',
            businessUnitName: 'Engineering',
          }),
        ]}
      />
    );
    expect(screen.getByTestId('owner-map-bu-Commerce')).toBeInTheDocument();
    expect(screen.getByTestId('owner-map-bu-Engineering')).toBeInTheDocument();
    expect(screen.getByTestId('owner-map-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('owner-map-row-b')).toBeInTheDocument();
    expect(screen.getByTestId('owner-map-row-c')).toBeInTheDocument();
  });

  it('groups owners without team/BU under fallback labels', () => {
    render(<OwnerMap owners={[row({ ownerId: 'x', ownerName: 'X' })]} />);
    expect(screen.getByTestId('owner-map-bu-No business unit')).toBeInTheDocument();
  });

  it('renders per-severity badges only for non-zero counts', () => {
    render(
      <OwnerMap
        owners={[
          row({
            ownerId: 'a',
            ownerName: 'Alice',
            openFindingCount: 3,
            severityCounts: [
              { severity: CanonicalSeverity.Critical, count: 0 },
              { severity: CanonicalSeverity.High, count: 1 },
              { severity: CanonicalSeverity.Medium, count: 2 },
              { severity: CanonicalSeverity.Low, count: 0 },
              { severity: CanonicalSeverity.Info, count: 0 },
            ],
          }),
        ]}
      />
    );
    expect(screen.queryByTestId('owner-map-sev-a-critical')).toBeNull();
    expect(screen.getByTestId('owner-map-sev-a-high')).toHaveTextContent('1');
    expect(screen.getByTestId('owner-map-sev-a-medium')).toHaveTextContent('2');
  });
});
