import type { Meta, StoryObj } from '@storybook/react';
import { OutcomeRow } from './outcome-row';
import { runInStory } from './opportunities-fixtures';
import { PENDING_OUTCOME, PERSISTING_OUTCOME, SOLVED_OUTCOME } from './outcomes-fixtures';

const meta: Meta<typeof OutcomeRow> = {
  title: 'Features/Opportunities/OutcomeRow',
  component: OutcomeRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
  decorators: [
    (Story) => (
      <ul className="max-w-3xl">
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Shipped, waiting for its window; two customers to tell. */
export const Pending: Story = { args: { view: PENDING_OUTCOME } };

export const Solved: Story = { args: { view: SOLVED_OUTCOME } };

export const Persisting: Story = { args: { view: PERSISTING_OUTCOME } };
