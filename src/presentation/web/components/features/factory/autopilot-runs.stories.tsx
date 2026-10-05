import type { Meta, StoryObj } from '@storybook/react';
import { AutopilotRuns } from './autopilot-runs';
import { QUIET_RUN, RUN } from './factory-fixtures';

const meta: Meta<typeof AutopilotRuns> = {
  title: 'Features/Factory/AutopilotRuns',
  component: AutopilotRuns,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { runs: [RUN, QUIET_RUN] } };

export const None: Story = { args: { runs: [] } };
