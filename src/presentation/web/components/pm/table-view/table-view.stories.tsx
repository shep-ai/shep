import type { Meta, StoryObj } from '@storybook/react';
import { TableView } from './table-view';
import { StateGroup, Priority } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState, Label } from '@shepai/core/domain/generated/output';
import { fn } from '@storybook/test';

const mockStates: WorkItemState[] = [
  {
    id: 's1',
    projectId: 'proj-1',
    name: 'Backlog',
    color: '#a3a3a3',
    stateGroup: StateGroup.Backlog,
    displayOrder: 0,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's2',
    projectId: 'proj-1',
    name: 'Todo',
    color: '#3b82f6',
    stateGroup: StateGroup.Unstarted,
    displayOrder: 1,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's3',
    projectId: 'proj-1',
    name: 'In Progress',
    color: '#f59e0b',
    stateGroup: StateGroup.Started,
    displayOrder: 2,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's4',
    projectId: 'proj-1',
    name: 'Done',
    color: '#22c55e',
    stateGroup: StateGroup.Completed,
    displayOrder: 3,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's5',
    projectId: 'proj-1',
    name: 'Cancelled',
    color: '#ef4444',
    stateGroup: StateGroup.Cancelled,
    displayOrder: 4,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockLabels: Label[] = [
  {
    id: 'l1',
    projectId: 'proj-1',
    name: 'bug',
    color: '#ef4444',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'l2',
    projectId: 'proj-1',
    name: 'enhancement',
    color: '#3b82f6',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockWorkItems: WorkItem[] = [
  {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'PM',
    title: 'Set up project scaffolding',
    stateId: 's4',
    priority: Priority.High,
    sortOrder: 0,
    startDate: new Date('2024-03-01'),
    dueDate: new Date('2024-03-10'),
    estimateValue: 'M',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-2',
    projectId: 'proj-1',
    sequenceId: 2,
    identifierPrefix: 'PM',
    title: 'Design component library with tokens and theme support',
    stateId: 's3',
    priority: Priority.Medium,
    sortOrder: 1,
    startDate: new Date('2024-03-05'),
    dueDate: new Date('2024-03-20'),
    estimateValue: 'L',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-3',
    projectId: 'proj-1',
    sequenceId: 3,
    identifierPrefix: 'PM',
    title: 'Implement navigation sidebar',
    stateId: 's2',
    priority: Priority.Medium,
    sortOrder: 2,
    estimateValue: 'S',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-4',
    projectId: 'proj-1',
    sequenceId: 4,
    identifierPrefix: 'PM',
    title: 'Build dashboard page with analytics widgets',
    stateId: 's1',
    priority: Priority.Low,
    sortOrder: 3,
    dueDate: new Date('2024-04-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-5',
    projectId: 'proj-1',
    sequenceId: 5,
    identifierPrefix: 'PM',
    title: 'Add dark mode support',
    stateId: 's1',
    priority: Priority.None,
    sortOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-6',
    projectId: 'proj-1',
    sequenceId: 6,
    identifierPrefix: 'PM',
    title: 'Fix critical authentication bypass vulnerability',
    stateId: 's3',
    priority: Priority.Urgent,
    sortOrder: 5,
    startDate: new Date('2024-03-12'),
    dueDate: new Date('2024-03-13'),
    estimateValue: 'XS',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-7',
    projectId: 'proj-1',
    sequenceId: 7,
    identifierPrefix: 'PM',
    title: 'Migrate database from v2 to v3 schema',
    stateId: 's5',
    priority: Priority.High,
    sortOrder: 6,
    startDate: new Date('2024-02-01'),
    dueDate: new Date('2024-02-15'),
    estimateValue: 'XL',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const meta: Meta<typeof TableView> = {
  title: 'PM/TableView',
  component: TableView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onWorkItemUpdate: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', minHeight: '400px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workItems: mockWorkItems,
    states: mockStates,
    labels: mockLabels,
    projectPrefix: 'PM',
  },
};

export const Empty: Story = {
  args: {
    workItems: [],
    states: mockStates,
    labels: mockLabels,
    projectPrefix: 'PM',
  },
};

export const SingleItem: Story = {
  args: {
    workItems: [mockWorkItems[0]],
    states: mockStates,
    labels: mockLabels,
    projectPrefix: 'PM',
  },
};
