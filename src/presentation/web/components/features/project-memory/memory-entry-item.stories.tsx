import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import {
  MemoryCategory,
  MemoryScope,
  type ProjectMemory,
} from '@shepai/core/domain/generated/output';
import { MemoryEntryItem } from './memory-entry-item';
import type { MemorySpaceOption } from './memory-space-option';

const NOW = new Date('2026-06-01T10:00:00Z');

const SPACES: MemorySpaceOption[] = [
  {
    id: 'space-acme',
    name: 'Acme',
    color: '#3456c4',
    productLines: [{ id: 'line-pay', name: 'Payments' }],
  },
];

const ENTRY: ProjectMemory = {
  id: 'm-1',
  repositoryPath: '/work/acme/payments-api',
  category: MemoryCategory.Convention,
  entryKey: 'money-as-minor-units',
  content: 'Store money as integer minor units; never use floats for amounts.',
  sourceFeatureId: 'feat-212-refunds',
  spaceId: 'space-acme',
  scope: MemoryScope.Project,
  createdAt: NOW,
  updatedAt: NOW,
};

const meta: Meta<typeof MemoryEntryItem> = {
  title: 'Features/ProjectMemory/MemoryEntryItem',
  component: MemoryEntryItem,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul className="max-w-2xl">
        <Story />
      </ul>
    ),
  ],
  args: {
    entry: ENTRY,
    spaces: SPACES,
    editing: false,
    draft: '',
    onDraftChange: fn(),
    onEdit: fn(),
    onCancel: fn(),
    onSave: fn(),
    onDelete: fn(),
    onScope: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const RepositoryOnly: Story = {};

export const SharedWithProductLine: Story = {
  args: { entry: { ...ENTRY, scope: MemoryScope.ProductLine, productLineId: 'line-pay' } },
};

export const SharedWithSpace: Story = {
  args: { entry: { ...ENTRY, scope: MemoryScope.Space } },
};

export const Editing: Story = {
  args: { editing: true, draft: ENTRY.content },
};
