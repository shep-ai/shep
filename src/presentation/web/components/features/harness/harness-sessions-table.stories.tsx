import type { Meta, StoryObj } from '@storybook/react';
import { fixtureSessionList } from './harness-fixtures';
import { HarnessSessionsTable } from './harness-sessions-table';

const meta: Meta<typeof HarnessSessionsTable> = {
  title: 'Harness/HarnessSessionsTable',
  component: HarnessSessionsTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSessionsTable>;

/** Standalone and feature sessions, one waiting for approval. */
export const Default: Story = { args: { items: fixtureSessionList } };

/** No sessions yet. */
export const Empty: Story = { args: { items: [] } };
