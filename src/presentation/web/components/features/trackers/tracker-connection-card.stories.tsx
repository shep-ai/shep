import type { Meta, StoryObj } from '@storybook/react';
import { TrackerConnectionCard } from './tracker-connection-card';
import { OVERVIEW, PROJECTS, runInStory } from './trackers-fixtures';
import { NOTION_OVERVIEW, PRODUCT_LINES } from '../knowledge/knowledge-fixtures';

const meta: Meta<typeof TrackerConnectionCard> = {
  title: 'Features/Trackers/TrackerConnectionCard',
  component: TrackerConnectionCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { projects: PROJECTS, productLines: PRODUCT_LINES, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const JiraWithRules: Story = { args: { overview: OVERVIEW.connections[0] } };

/** Rejected credentials: the error is shown and Test re-checks them. */
export const BrokenLinear: Story = { args: { overview: OVERVIEW.connections[1] } };

/** A Notion connection: knowledge sources instead of sync rules (spec 125). */
export const NotionWithSources: Story = { args: { overview: NOTION_OVERVIEW } };
