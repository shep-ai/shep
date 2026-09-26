import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AGENT_DEFAULT_EFFORT_VALUE,
  EffortSelect,
  effortFromSelectValue,
  selectValueFromEffort,
} from '@/components/common/effort-select';
import { AgentEffort } from '@shepai/core/domain/generated/output';

describe('EffortSelect value mapping', () => {
  it('maps the agent-default sentinel to undefined', () => {
    expect(effortFromSelectValue(AGENT_DEFAULT_EFFORT_VALUE)).toBeUndefined();
  });

  it('maps every level to its AgentEffort', () => {
    for (const level of Object.values(AgentEffort)) {
      expect(effortFromSelectValue(level)).toBe(level);
    }
  });

  it('maps unset effort to the sentinel and a level to itself', () => {
    expect(selectValueFromEffort(undefined)).toBe(AGENT_DEFAULT_EFFORT_VALUE);
    expect(selectValueFromEffort(AgentEffort.xhigh)).toBe('xhigh');
  });
});

describe('EffortSelect', () => {
  it('shows "Agent default" when no effort is set', () => {
    render(<EffortSelect onChange={vi.fn()} />);
    expect(screen.getByTestId('effort-select')).toHaveTextContent('Agent default');
  });

  it('shows the selected level', () => {
    render(<EffortSelect value={AgentEffort.high} onChange={vi.fn()} />);
    expect(screen.getByTestId('effort-select')).toHaveTextContent('High');
  });

  it('uses a custom test id and id for the trigger', () => {
    render(<EffortSelect id="my-effort" testId="custom-effort" onChange={vi.fn()} />);
    expect(screen.getByTestId('custom-effort')).toHaveAttribute('id', 'my-effort');
  });

  it('uses a custom label for the unset option', () => {
    render(<EffortSelect defaultLabel="From settings" onChange={vi.fn()} />);
    expect(screen.getByTestId('effort-select')).toHaveTextContent('From settings');
  });

  it('exposes an accessible name when given one', () => {
    render(<EffortSelect ariaLabel="Effort" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Effort' })).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<EffortSelect disabled onChange={vi.fn()} />);
    expect(screen.getByTestId('effort-select')).toBeDisabled();
  });

  it('merges className onto the trigger', () => {
    render(<EffortSelect className="w-40" onChange={vi.fn()} />);
    expect(screen.getByTestId('effort-select')).toHaveClass('w-40');
  });
});
