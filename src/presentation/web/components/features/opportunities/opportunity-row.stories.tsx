import type { Meta, StoryObj } from '@storybook/react';
import { OpportunityRow } from './opportunity-row';
import { BUILDING, CHECKOUT, EXPORT, IDEA, OPTIONS, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof OpportunityRow> = {
  title: 'Features/Opportunities/OpportunityRow',
  component: OpportunityRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul>
        <Story />
      </ul>
    ),
  ],
  args: { projects: OPTIONS.projects, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AcceptedInLine: Story = { args: { scored: CHECKOUT, inLine: true } };

/** Accepted but too big for what is left of the week. */
export const Waiting: Story = { args: { scored: EXPORT, inLine: false } };

export const Proposed: Story = { args: { scored: IDEA, inLine: false } };

/** Already a work item: no decisions left. */
export const Building: Story = { args: { scored: BUILDING, inLine: true } };
