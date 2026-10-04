import type { Meta, StoryObj } from '@storybook/react';
import { TrackerRuleRow } from './tracker-rule-row';
import { FAILING_RULE, JIRA_RULE, runInStory } from './trackers-fixtures';

const meta: Meta<typeof TrackerRuleRow> = {
  title: 'Features/Trackers/TrackerRuleRow',
  component: TrackerRuleRow,
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

export const TwoWayWithLastRun: Story = { args: { view: JIRA_RULE } };

export const PausedAndRateLimited: Story = { args: { view: FAILING_RULE } };

export const NeverRan: Story = {
  args: {
    view: {
      ...JIRA_RULE,
      rule: { ...JIRA_RULE.rule, lastRun: undefined, lastRunAt: undefined },
    },
  },
};
