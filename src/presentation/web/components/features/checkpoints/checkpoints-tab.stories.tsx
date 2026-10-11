import type { Meta, StoryObj } from '@storybook/react';
import { CheckpointsTab } from './checkpoints-tab';

const meta: Meta<typeof CheckpointsTab> = {
  title: 'Features/Checkpoints/CheckpointsTab',
  component: CheckpointsTab,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[720px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CheckpointsTab>;

/** Feature drawer → Checkpoints, loaded through the (mocked) server actions. */
export const Default: Story = { args: { featureId: 'feat-1' } };
