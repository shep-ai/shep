import type { Meta, StoryObj } from '@storybook/react';
import { AgentEffort } from '@shepai/core/domain/generated/output';
import { EffortSettingsControl } from './effort-settings-control';

const meta: Meta<typeof EffortSettingsControl> = {
  title: 'Features/Settings/EffortSettingsControl',
  component: EffortSettingsControl,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    initialEffort: {
      control: 'select',
      options: [undefined, ...Object.values(AgentEffort)],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** No default effort configured (agent default). */
export const Default: Story = {
  args: {
    initialEffort: undefined,
  },
};

export const ConfiguredHigh: Story = {
  args: {
    initialEffort: AgentEffort.high,
  },
};

export const ConfiguredMax: Story = {
  args: {
    initialEffort: AgentEffort.max,
  },
};
