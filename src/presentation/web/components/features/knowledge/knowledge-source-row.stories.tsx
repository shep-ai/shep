import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeSourceRow } from './knowledge-source-row';
import { HANDBOOK_SOURCE, PRD_SOURCE } from './knowledge-fixtures';
import { runInStory } from '../trackers/trackers-fixtures';

const meta: Meta<typeof KnowledgeSourceRow> = {
  title: 'Features/Knowledge/KnowledgeSourceRow',
  component: KnowledgeSourceRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul>
        <Story />
      </ul>
    ),
  ],
  args: { run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Synced: Story = { args: { view: HANDBOOK_SOURCE } };

/** Paused, limited to a product line, and its last sync was rate limited. */
export const PausedWithError: Story = { args: { view: PRD_SOURCE, productLineName: 'Payments' } };
