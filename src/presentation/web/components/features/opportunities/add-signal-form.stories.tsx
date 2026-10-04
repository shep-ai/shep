import type { Meta, StoryObj } from '@storybook/react';
import { AddSignalForm } from './add-signal-form';
import { runInStory } from './opportunities-fixtures';

const meta: Meta<typeof AddSignalForm> = {
  title: 'Features/Opportunities/AddSignalForm',
  component: AddSignalForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
