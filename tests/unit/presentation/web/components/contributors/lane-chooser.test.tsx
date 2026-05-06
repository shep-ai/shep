import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LaneChooser } from '@/components/contributors/LaneChooser';
import { ContributorLane } from '@shepai/core/domain/generated/output';

describe('LaneChooser', () => {
  it('renders one option per ContributorLane enum value', () => {
    render(<LaneChooser onLaneChange={() => undefined} />);

    const lanes = Object.values(ContributorLane);
    expect(lanes).toHaveLength(5);

    for (const lane of lanes) {
      expect(screen.getByTestId(`lane-chooser-option-${lane}`)).toBeInTheDocument();
    }
  });

  it('invokes onLaneChange with the selected enum value', () => {
    const onLaneChange = vi.fn();
    render(<LaneChooser onLaneChange={onLaneChange} />);

    const select = screen.getByTestId('lane-chooser-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: ContributorLane.Agents } });

    expect(onLaneChange).toHaveBeenCalledTimes(1);
    expect(onLaneChange).toHaveBeenCalledWith(ContributorLane.Agents);
  });

  it('respects controlled `value` prop', () => {
    render(<LaneChooser value={ContributorLane.Cli} onLaneChange={() => undefined} />);
    const select = screen.getByTestId('lane-chooser-select') as HTMLSelectElement;
    expect(select.value).toBe(ContributorLane.Cli);
  });
});
