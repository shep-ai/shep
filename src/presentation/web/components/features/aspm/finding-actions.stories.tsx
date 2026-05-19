import type { Meta, StoryObj } from '@storybook/react';

import { FindingActions } from './finding-actions';

const meta: Meta<typeof FindingActions> = {
  title: 'Features/Aspm/FindingActions',
  component: FindingActions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const stubActions = {
  declareException: async () => undefined,
  revokeException: async () => undefined,
  convertToWorkItem: async () => ({ workItemId: 'wi-12345678' }),
};

export const Default: Story = {
  args: { findingId: 'f-1', workItemId: null, actions: stubActions },
};

export const AlreadyLinked: Story = {
  args: { findingId: 'f-1', workItemId: 'wi-deadbeef', actions: stubActions },
};

export const FailingDeclare: Story = {
  args: {
    findingId: 'f-1',
    workItemId: null,
    actions: {
      ...stubActions,
      declareException: async () => {
        throw new Error('Policy says no');
      },
    },
  },
};
