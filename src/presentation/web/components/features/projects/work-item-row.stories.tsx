import type { Meta, StoryObj } from '@storybook/react';
import { WorkItemRow } from './work-item-row';
import { StateGroup, Priority } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

const mockState: WorkItemState = {
  id: 's1',
  projectId: 'proj-1',
  name: 'In Progress',
  color: '#f59e0b',
  stateGroup: StateGroup.Started,
  displayOrder: 2,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWorkItem: WorkItem = {
  id: 'wi-1',
  projectId: 'proj-1',
  sequenceId: 42,
  identifierPrefix: 'FE',
  title: 'Implement the project management list view',
  stateId: 's1',
  priority: Priority.High,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const meta: Meta<typeof WorkItemRow> = {
  title: 'Features/WorkItemRow',
  component: WorkItemRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workItem: mockWorkItem,
    state: mockState,
    projectPrefix: 'FE',
  },
};

export const UrgentPriority: Story = {
  args: {
    workItem: { ...mockWorkItem, priority: Priority.Urgent },
    state: mockState,
    projectPrefix: 'FE',
  },
};

export const NoPriority: Story = {
  args: {
    workItem: { ...mockWorkItem, priority: Priority.None },
    state: mockState,
    projectPrefix: 'FE',
  },
};

export const LongTitle: Story = {
  args: {
    workItem: {
      ...mockWorkItem,
      title:
        'This is a very long work item title that should be truncated when it exceeds the available space in the row',
    },
    state: mockState,
    projectPrefix: 'FE',
  },
};

export const NoState: Story = {
  args: {
    workItem: mockWorkItem,
    state: undefined,
    projectPrefix: 'FE',
  },
};
