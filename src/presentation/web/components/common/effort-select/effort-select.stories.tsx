import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { AgentEffort } from '@shepai/core/domain/generated/output';
import { EffortSelect } from './effort-select';

const meta: Meta<typeof EffortSelect> = {
  title: 'Composed/EffortSelect',
  component: EffortSelect,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
  argTypes: {
    value: {
      control: 'select',
      options: [undefined, ...Object.values(AgentEffort)],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** No effort set: the agent CLI decides. */
export const Default: Story = {
  args: {
    value: undefined,
  },
};

export const Low: Story = {
  args: { value: AgentEffort.low },
};

export const ExtraHigh: Story = {
  args: { value: AgentEffort.xhigh },
};

/** Per-feature override in the create drawer, where unset means "use settings". */
export const FromSettingsLabel: Story = {
  args: {
    value: undefined,
    defaultLabel: 'From settings',
    ariaLabel: 'Effort',
  },
};

export const Disabled: Story = {
  args: {
    value: AgentEffort.medium,
    disabled: true,
  },
};
