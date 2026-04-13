import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { IntakeTriagePanel } from './intake-triage-panel';
import { IntakeStatus } from '@shepai/core/domain/generated/output';
import type { IntakeItem } from '@shepai/core/domain/generated/output';

const NOW = new Date();

const mockItems: IntakeItem[] = [
  {
    id: 'i1',
    projectId: 'proj-1',
    title: 'Login button not working on mobile',
    description: 'Users report the login button is unresponsive on iOS Safari and Android Chrome.',
    source: 'manual',
    status: IntakeStatus.Pending,
    suggestedPriority: 'High',
    suggestedLabels: '["bug","mobile"]',
    triageNotes: 'Mobile-specific issue affecting login flow. High priority due to user impact.',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'i2',
    projectId: 'proj-1',
    title: 'Add dark mode support',
    description: 'Feature request for dark mode theme toggle in settings.',
    source: 'api',
    status: IntakeStatus.Pending,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'i3',
    projectId: 'proj-1',
    title: 'Dashboard loading slow',
    source: 'manual',
    status: IntakeStatus.Pending,
    suggestedPriority: 'Medium',
    triageNotes: 'Performance issue. Consider lazy loading dashboard widgets.',
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const meta: Meta<typeof IntakeTriagePanel> = {
  title: 'PM/IntakeTriagePanel',
  component: IntakeTriagePanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    onItemsChange: fn(),
    onWorkItemCreated: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPendingItems: Story = {
  args: {
    projectId: 'proj-1',
    items: mockItems,
  },
};

export const WithAiSuggestions: Story = {
  args: {
    projectId: 'proj-1',
    items: [mockItems[0]],
  },
};

export const NoSuggestions: Story = {
  args: {
    projectId: 'proj-1',
    items: [mockItems[1]],
  },
};

export const Empty: Story = {
  args: {
    projectId: 'proj-1',
    items: [],
  },
};
