import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CheckpointCompareBar } from './checkpoint-compare-bar';
import { fixtureCheckpoints } from './checkpoint-fixtures';

const meta: Meta<typeof CheckpointCompareBar> = {
  title: 'Features/Checkpoints/CheckpointCompareBar',
  component: CheckpointCompareBar,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CheckpointCompareBar>;

function Interactive({ from, to }: { from: string; to: string }) {
  const [fromLabel, setFromLabel] = useState(from);
  const [toLabel, setToLabel] = useState(to);
  return (
    <CheckpointCompareBar
      checkpoints={fixtureCheckpoints}
      from={fromLabel}
      to={toLabel}
      onFromChange={setFromLabel}
      onToChange={setToLabel}
    />
  );
}

/** Baseline compared with the latest step — the whole run. */
export const Default: Story = {
  render: () => <Interactive from="0000-baseline" to="0004-repair_research" />,
};

/** Two adjacent steps. */
export const AdjacentSteps: Story = {
  render: () => <Interactive from="0002-plan" to="0003-implement" />,
};
