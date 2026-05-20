import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { LaneChooser } from './LaneChooser';
import { ContributorLane } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof LaneChooser> = {
  title: 'Contributors/LaneChooser',
  component: LaneChooser,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LaneChooser>;

export const Default: Story = {
  args: {
    onLaneChange: () => undefined,
  },
};

export const Selected: Story = {
  args: {
    value: ContributorLane.Agents,
    onLaneChange: () => undefined,
  },
};

function InteractiveLaneChooser() {
  const [lane, setLane] = useState<ContributorLane | undefined>(undefined);
  return (
    <div className="flex flex-col gap-3">
      <LaneChooser value={lane} onLaneChange={setLane} />
      <p className="text-muted-foreground text-sm">
        Selected: <code>{lane ?? 'none'}</code>
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractiveLaneChooser />,
};
