import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import { ConnectionProvider } from '@shepai/core/domain/generated/output';
import { AddConnectionForm } from './add-connection-form';
import { SPACES, runInStory } from './trackers-fixtures';

const meta: Meta<typeof AddConnectionForm> = {
  title: 'Features/Trackers/AddConnectionForm',
  component: AddConnectionForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaces: SPACES, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Linear: Story = {};

/** Jira asks for its site URL and account email too. */
export const Jira: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.selectOptions(
      within(canvasElement).getByTestId('add-connection-provider'),
      ConnectionProvider.Jira
    );
  },
};
