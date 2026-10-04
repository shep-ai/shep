import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeDocumentsPanel } from './knowledge-documents-panel';
import { PRODUCT_LINE_NAMES, SPACE_KNOWLEDGE } from './knowledge-fixtures';

const meta: Meta<typeof KnowledgeDocumentsPanel> = {
  title: 'Features/Knowledge/KnowledgeDocumentsPanel',
  component: KnowledgeDocumentsPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: { productLines: PRODUCT_LINE_NAMES },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDocuments: Story = { args: { groups: SPACE_KNOWLEDGE } };

export const Empty: Story = { args: { groups: [] } };
