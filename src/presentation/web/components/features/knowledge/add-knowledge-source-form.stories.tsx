import type { Meta, StoryObj } from '@storybook/react';
import { AddKnowledgeSourceForm } from './add-knowledge-source-form';
import { PRODUCT_LINES } from './knowledge-fixtures';
import { runInStory } from '../trackers/trackers-fixtures';

const meta: Meta<typeof AddKnowledgeSourceForm> = {
  title: 'Features/Knowledge/AddKnowledgeSourceForm',
  component: AddKnowledgeSourceForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { connectionId: 'conn-notion', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithProductLines: Story = { args: { productLines: PRODUCT_LINES } };

/** A space without product lines: sources are always space-wide. */
export const SpaceWideOnly: Story = { args: { productLines: [] } };
