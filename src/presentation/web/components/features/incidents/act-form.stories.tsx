import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import { RuntimeActionKind } from '@shepai/core/domain/generated/output';
import { ActForm } from './act-form';
import { runInStory } from './incidents-fixtures';

const meta: Meta<typeof ActForm> = {
  title: 'Features/Incidents/ActForm',
  component: ActForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { incidentId: 'inc-checkout', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Restart: Story = {};

/** Scaling asks for the replica count. */
export const Scale: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByTestId('act-kind'), RuntimeActionKind.Scale);
    await userEvent.type(canvas.getByTestId('act-replicas'), '6');
  },
};
