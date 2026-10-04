import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeSourcesSection } from './knowledge-sources-section';
import { HANDBOOK_SOURCE, PRD_SOURCE, PRODUCT_LINES } from './knowledge-fixtures';
import { runInStory } from '../trackers/trackers-fixtures';

const meta: Meta<typeof KnowledgeSourcesSection> = {
  title: 'Features/Knowledge/KnowledgeSourcesSection',
  component: KnowledgeSourcesSection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { connectionId: 'conn-notion', productLines: PRODUCT_LINES, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A page tree for the whole space and a paused database limited to Payments. */
export const WithSources: Story = { args: { sources: [HANDBOOK_SOURCE, PRD_SOURCE] } };

export const Empty: Story = { args: { sources: [] } };
