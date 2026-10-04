import type { Meta, StoryObj } from '@storybook/react';
import { CapacityBar } from './capacity-bar';

const meta: Meta<typeof CapacityBar> = {
  title: 'Features/Opportunities/CapacityBar',
  component: CapacityBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { usedHours: 14, capacityHours: 16, waiting: 1 } };

export const Empty: Story = { args: { usedHours: 0, capacityHours: 16, waiting: 0 } };

export const Full: Story = { args: { usedHours: 16, capacityHours: 16, waiting: 3 } };
