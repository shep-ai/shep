import type { Meta, StoryObj } from '@storybook/react';
import { HarnessNewTaskForm } from './harness-new-task-form';

const meta: Meta<typeof HarnessNewTaskForm> = {
  title: 'Harness/HarnessNewTaskForm',
  component: HarnessNewTaskForm,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessNewTaskForm>;

/** Repository picker, task text, mode and shadow switch. */
export const Default: Story = {
  args: { repositories: ['/home/dev/acme-api', '/home/dev/acme-web'] },
};

/** No known repositories: type a path. */
export const NoRepositories: Story = { args: { repositories: [] } };
