import type { Meta, StoryObj } from '@storybook/react';
import { FactoryStatusCards } from './factory-status-cards';
import { STATUS } from './factory-fixtures';

const meta: Meta<typeof FactoryStatusCards> = {
  title: 'Features/Factory/FactoryStatusCards',
  component: FactoryStatusCards,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** An incident, an action and two customers wait on people. */
export const Default: Story = { args: { status: STATUS } };

export const Quiet: Story = {
  args: {
    status: { ...STATUS, openIncidents: 0, actionsAwaitingApproval: 0, customersToTell: 0 },
  },
};
