import type { Meta, StoryObj } from '@storybook/react';
import { AddRelationDialog } from './add-relation-dialog';

const meta: Meta<typeof AddRelationDialog> = {
  title: 'PM/AddRelationDialog',
  component: AddRelationDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    sourceWorkItemId: 'wi-1',
    onCreated: () => undefined,
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onOpenChange: () => undefined,
    sourceWorkItemId: 'wi-1',
    onCreated: () => undefined,
  },
};
