'use client';

/**
 * LaneChooser — spec 097, FR-37 / task-44.
 *
 * Dropdown over the five values of the ContributorLane TypeSpec enum. Pure
 * presentation: emits `onLaneChange` and never holds its own state. Options
 * are derived from `Object.values(ContributorLane)` so adding a new lane to
 * the enum surfaces here automatically.
 */

import { ContributorLane } from '@shepai/core/domain/generated/output';

const LANE_LABEL: Record<ContributorLane, string> = {
  [ContributorLane.Docs]: 'Docs',
  [ContributorLane.Agents]: 'Agents',
  [ContributorLane.Ui]: 'UI',
  [ContributorLane.Cli]: 'CLI',
  [ContributorLane.Infra]: 'Infra',
};

const LANE_DESCRIPTION: Record<ContributorLane, string> = {
  [ContributorLane.Docs]: 'Guides, references, READMEs',
  [ContributorLane.Agents]: 'Prompts, graphs, custom agents',
  [ContributorLane.Ui]: 'Web dashboard & components',
  [ContributorLane.Cli]: 'CLI commands & TUI',
  [ContributorLane.Infra]: 'Build, CI, deps, releases',
};

const LANE_OPTIONS = Object.values(ContributorLane) as readonly ContributorLane[];

export interface LaneChooserProps {
  value?: ContributorLane;
  onLaneChange: (lane: ContributorLane) => void;
  label?: string;
  id?: string;
}

export function LaneChooser({
  value,
  onLaneChange,
  label = 'Pick a lane',
  id = 'lane-chooser',
}: LaneChooserProps) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="lane-chooser">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onLaneChange(e.target.value as ContributorLane)}
        className="border-input bg-background ring-offset-background focus:ring-ring h-9 rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none"
        data-testid="lane-chooser-select"
      >
        <option value="" disabled>
          Choose a lane…
        </option>
        {LANE_OPTIONS.map((lane) => (
          <option key={lane} value={lane} data-testid={`lane-chooser-option-${lane}`}>
            {LANE_LABEL[lane]} — {LANE_DESCRIPTION[lane]}
          </option>
        ))}
      </select>
    </div>
  );
}
