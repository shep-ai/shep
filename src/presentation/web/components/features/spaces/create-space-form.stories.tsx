import type { Meta, StoryObj } from '@storybook/react';
import { CreateSpaceForm } from './create-space-form';
import { runInStory } from './spaces-fixtures';

const meta: Meta<typeof CreateSpaceForm> = {
  title: 'Features/Spaces/CreateSpaceForm',
  component: CreateSpaceForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A run that always fails, to show the form keeping its input. */
export const Refused: Story = {
  args: { run: async () => false },
};
