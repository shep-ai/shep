import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { EditSpaceForm } from './edit-space-form';
import { ACME, PERSONAL, runInStory } from './spaces-fixtures';

const meta: Meta<typeof EditSpaceForm> = {
  title: 'Features/Spaces/EditSpaceForm',
  component: EditSpaceForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory, onDone: fn() },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithColour: Story = {
  args: { space: ACME },
};

export const WithoutColour: Story = {
  args: { space: PERSONAL },
};
