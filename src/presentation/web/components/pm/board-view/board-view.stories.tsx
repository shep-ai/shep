import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { BoardView } from './board-view';
import { StateGroup, Priority } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

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
];

const mockWorkItems: WorkItem[] = [
  {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'FE',
    title: 'Set up project scaffolding',
    stateId: 's4',
    priority: Priority.High,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-2',
    projectId: 'proj-1',
    sequenceId: 2,
    identifierPrefix: 'FE',
    title: 'Design component library',
    stateId: 's3',
    priority: Priority.Medium,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-3',
    projectId: 'proj-1',
    sequenceId: 3,
    identifierPrefix: 'FE',
    title: 'Implement navigation sidebar',
    stateId: 's2',
    priority: Priority.Medium,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-4',
    projectId: 'proj-1',
    sequenceId: 4,
    identifierPrefix: 'FE',
    title: 'Build dashboard page',
    stateId: 's1',
    priority: Priority.Low,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-5',
    projectId: 'proj-1',
    sequenceId: 5,
    identifierPrefix: 'FE',
    title: 'Add dark mode support',
    stateId: 's1',
    priority: Priority.None,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-6',
    projectId: 'proj-1',
    sequenceId: 6,
    identifierPrefix: 'FE',
    title: 'Implement user authentication flow',
    stateId: 's3',
    priority: Priority.Urgent,
    sortOrder: 1,
    dueDate: new Date('2025-03-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-7',
    projectId: 'proj-1',
    sequenceId: 7,
    identifierPrefix: 'FE',
    title: 'Write API integration tests',
    stateId: 's2',
    priority: Priority.High,
    sortOrder: 1,
    dueDate: new Date('2025-04-01'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-8',
    projectId: 'proj-1',
    sequenceId: 8,
    identifierPrefix: 'FE',
    title: 'Configure CI/CD pipeline',
    stateId: 's4',
    priority: Priority.Medium,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const meta: Meta<typeof BoardView> = {
  title: 'PM/BoardView',
  component: BoardView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onWorkItemUpdate: fn(),
    onCardClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[600px] w-full">
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
    projectPrefix: 'FE',
  },
};

export const EmptyBoard: Story = {
  args: {
    workItems: [],
    states: mockStates,
    projectPrefix: 'FE',
  },
};

export const SingleColumn: Story = {
  args: {
    workItems: mockWorkItems.filter((wi) => wi.stateId === 's3'),
    states: [mockStates[2]],
    projectPrefix: 'FE',
  },
};
