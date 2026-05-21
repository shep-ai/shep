/**
 * FindingsTable component tests (feature 098, phase 3).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FindingsTable } from '@/components/features/aspm/findings-table';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const now = new Date();
  return {
    id: 'f-1',
    applicationId: 'app',
    findingDomain: FindingDomain.Code,
    ruleId: 'r.1',
    title: 'Sample finding',
    description: 'desc',
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

describe('FindingsTable', () => {
  it('renders the Loading state', () => {
    render(<FindingsTable findings={[]} loading />);
    expect(screen.getByTestId('findings-table-loading')).toBeInTheDocument();
  });

  it('renders the Error state', () => {
    render(<FindingsTable findings={[]} error="Nope" />);
    expect(screen.getByTestId('findings-table-error')).toHaveTextContent('Nope');
  });

  it('renders the empty state when no findings', () => {
    render(<FindingsTable findings={[]} />);
    expect(screen.getByTestId('findings-table-empty')).toBeInTheDocument();
  });

  it('renders one row per finding', () => {
    render(
      <FindingsTable
        findings={[
          makeFinding({ id: 'a', title: 'Alpha' }),
          makeFinding({ id: 'b', title: 'Bravo' }),
        ]}
      />
    );
    expect(screen.getByTestId('findings-table-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('findings-table-row-b')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('fires onRowClick when a row is clicked', () => {
    const handler = vi.fn();
    render(<FindingsTable findings={[makeFinding({ id: 'a' })]} onRowClick={handler} />);
    fireEvent.click(screen.getByTestId('findings-table-row-a'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].id).toBe('a');
  });

  it('fires onRowClick on Enter keypress', () => {
    const handler = vi.fn();
    render(<FindingsTable findings={[makeFinding({ id: 'a' })]} onRowClick={handler} />);
    fireEvent.keyDown(screen.getByTestId('findings-table-row-a'), { key: 'Enter' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renders the location as path:line when both present', () => {
    render(
      <FindingsTable findings={[makeFinding({ locationPath: 'src/foo.ts', locationLine: 12 })]} />
    );
    expect(screen.getByText('src/foo.ts:12')).toBeInTheDocument();
  });

  it('renders an em dash when location is absent', () => {
    render(
      <FindingsTable
        findings={[makeFinding({ locationPath: undefined, locationLine: undefined })]}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the application name + slug when applications lookup is provided', () => {
    render(
      <FindingsTable
        findings={[makeFinding({ id: 'a', applicationId: 'app-1' })]}
        applications={[{ id: 'app-1', name: 'Payments API', slug: 'payments-api' }]}
      />
    );
    expect(screen.getByText('Payments API')).toBeInTheDocument();
    expect(screen.getByText('payments-api')).toBeInTheDocument();
  });

  it('falls back to a truncated applicationId when the lookup misses', () => {
    render(
      <FindingsTable findings={[makeFinding({ id: 'a', applicationId: 'abcdef0123456789' })]} />
    );
    expect(screen.getByText('abcdef01…')).toBeInTheDocument();
  });

  it.each([
    CanonicalSeverity.Critical,
    CanonicalSeverity.High,
    CanonicalSeverity.Medium,
    CanonicalSeverity.Low,
    CanonicalSeverity.Info,
  ])('renders a severity badge for %s', (severity) => {
    render(
      <FindingsTable findings={[makeFinding({ id: severity, canonicalSeverity: severity })]} />
    );
    expect(screen.getByTestId(`severity-badge-${severity.toLowerCase()}`)).toBeInTheDocument();
  });
});
