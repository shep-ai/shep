/**
 * FindingsFilterBar component tests (feature 098, phase 3).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FindingsFilterBar } from '@/components/features/aspm/findings-filter-bar';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
} from '@shepai/core/domain/generated/output';

describe('FindingsFilterBar', () => {
  it('renders all severity, domain, and state toggles', () => {
    render(<FindingsFilterBar filter={{}} onChange={() => undefined} />);
    expect(screen.getByRole('group', { name: /findings filters/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Critical' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'High' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Open' })).toBeInTheDocument();
  });

  it('toggles a severity value on click', () => {
    const onChange = vi.fn();
    render(<FindingsFilterBar filter={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Critical' }));
    expect(onChange).toHaveBeenCalledWith({
      severities: [CanonicalSeverity.Critical],
    });
  });

  it('removes a severity value on second click', () => {
    const onChange = vi.fn();
    render(
      <FindingsFilterBar
        filter={{ severities: [CanonicalSeverity.Critical] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Critical' }));
    expect(onChange).toHaveBeenCalledWith({ severities: [] });
  });

  it('reflects active state via aria-checked', () => {
    render(
      <FindingsFilterBar
        filter={{ findingDomains: [FindingDomain.Dependency] }}
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Dependency' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('checkbox', { name: 'Code' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the clear-all link only when filters are active', () => {
    const { rerender } = render(<FindingsFilterBar filter={{}} onChange={() => undefined} />);
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();
    rerender(
      <FindingsFilterBar filter={{ states: [FindingState.Open] }} onChange={() => undefined} />
    );
    expect(screen.getByText(/clear all/i)).toBeInTheDocument();
  });

  it('clear-all fires onChange with empty filter', () => {
    const onChange = vi.fn();
    render(
      <FindingsFilterBar
        filter={{ severities: [CanonicalSeverity.High], kev: true }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText(/clear all/i));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('counts KEV toggle into the active total', () => {
    render(<FindingsFilterBar filter={{ kev: true }} onChange={() => undefined} />);
    expect(screen.getByText(/1 active filter/i)).toBeInTheDocument();
  });
});
