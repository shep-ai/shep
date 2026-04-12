import type { Meta, StoryObj } from '@storybook/react';
import { CreateProjectDialog } from './create-project-dialog';

const meta: Meta<typeof CreateProjectDialog> = {
  title: 'Features/CreateProjectDialog',
  component: CreateProjectDialog,
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
    onCreated: () => undefined,
  },
};
