/**
 * SlaBadge component tests (feature 098, phase 6, task-39).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SlaBadge, SLA_BADGE_STATE } from '@/components/features/aspm/sla-badge';
import { SlaState } from '@shepai/core/domain/generated/output';

describe('SlaBadge', () => {
  it.each([
    [SLA_BADGE_STATE.Healthy, 'On track'],
    [SLA_BADGE_STATE.AtRisk, 'At risk'],
    [SLA_BADGE_STATE.Breached, 'Breached'],
    [SLA_BADGE_STATE.Exception, 'Exception'],
  ])('renders %s with the expected label', (state, label) => {
    render(<SlaBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('attaches an accessible aria-label that includes the full description', () => {
    render(<SlaBadge state={SLA_BADGE_STATE.Breached} />);
    expect(screen.getByLabelText(/SLA breached/)).toBeInTheDocument();
  });

  it('uses a stable data-testid keyed by state', () => {
    render(<SlaBadge state={SLA_BADGE_STATE.AtRisk} />);
    expect(screen.getByTestId('sla-badge-atrisk')).toBeInTheDocument();
  });

  it('maps the domain SlaState enum into the badge state', () => {
    render(<SlaBadge state={SlaState.Breached} />);
    expect(screen.getByTestId('sla-badge-breached')).toBeInTheDocument();
  });
});
