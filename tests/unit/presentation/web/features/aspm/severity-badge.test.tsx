/**
 * SeverityBadge component tests (feature 098, phase 3).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SeverityBadge } from '@/components/features/aspm/severity-badge';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

describe('SeverityBadge', () => {
  it.each([
    [CanonicalSeverity.Critical, 'Critical'],
    [CanonicalSeverity.High, 'High'],
    [CanonicalSeverity.Medium, 'Medium'],
    [CanonicalSeverity.Low, 'Low'],
    [CanonicalSeverity.Info, 'Info'],
  ])('renders %s with the expected label', (severity, label) => {
    render(<SeverityBadge severity={severity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('attaches an accessible aria-label', () => {
    render(<SeverityBadge severity={CanonicalSeverity.Critical} />);
    expect(screen.getByLabelText('Severity: Critical')).toBeInTheDocument();
  });

  it('uses a stable data-testid keyed by severity', () => {
    render(<SeverityBadge severity={CanonicalSeverity.High} />);
    expect(screen.getByTestId('severity-badge-high')).toBeInTheDocument();
  });
});
