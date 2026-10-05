import type { Meta, StoryObj } from '@storybook/react';
import { NoteForm } from './note-form';
import { runInStory } from './incidents-fixtures';

const meta: Meta<typeof NoteForm> = {
  title: 'Features/Incidents/NoteForm',
  component: NoteForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { incidentId: 'inc-checkout', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
