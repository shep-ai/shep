import type { Meta, StoryObj } from '@storybook/react';
import { ResolveForm } from './resolve-form';
import { runInStory } from './incidents-fixtures';

const meta: Meta<typeof ResolveForm> = {
  title: 'Features/Incidents/ResolveForm',
  component: ResolveForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { incidentId: 'inc-checkout', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
