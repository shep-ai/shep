import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import { OpenIncidentForm } from './open-incident-form';
import { runInStory } from './incidents-fixtures';

const meta: Meta<typeof OpenIncidentForm> = {
  title: 'Features/Incidents/OpenIncidentForm',
  component: OpenIncidentForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId('open-incident-title'), 'Checkout 5xx');
    await userEvent.type(canvas.getByTestId('open-incident-workload'), 'checkout');
    await userEvent.type(canvas.getByTestId('open-incident-namespace'), 'shop');
  },
};
