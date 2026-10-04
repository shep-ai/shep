import type { Meta, StoryObj } from '@storybook/react';
import { TrackerConnectionCard } from './tracker-connection-card';
import { OVERVIEW, PROJECTS, runInStory } from './trackers-fixtures';

const meta: Meta<typeof TrackerConnectionCard> = {
  title: 'Features/Trackers/TrackerConnectionCard',
  component: TrackerConnectionCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { projects: PROJECTS, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const JiraWithRules: Story = { args: { overview: OVERVIEW.connections[0] } };

/** Rejected credentials: the error is shown and Test re-checks them. */
export const BrokenLinear: Story = { args: { overview: OVERVIEW.connections[1] } };
