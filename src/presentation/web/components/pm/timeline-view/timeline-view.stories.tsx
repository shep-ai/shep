import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { TimelineView, type TimelineRelation } from './timeline-view';
import { Priority, StateGroup, RelationType } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

function daysFromNow(n: number): Date {
  return new Date(TODAY.getTime() + n * 86400000);
}

const mockStates: WorkItemState[] = [
  {
    id: 's1',
    projectId: 'proj-1',
    name: 'Todo',
    color: '#60a5fa',
    displayOrder: 0,
    stateGroup: StateGroup.Unstarted,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 's2',
    projectId: 'proj-1',
    name: 'In Progress',
    color: '#fbbf24',
    displayOrder: 1,
    stateGroup: StateGroup.Started,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 's3',
    projectId: 'proj-1',
    name: 'Done',
    color: '#34d399',
    displayOrder: 2,
    stateGroup: StateGroup.Completed,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const mockWorkItems: WorkItem[] = [
  {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'FE',
    title: 'Set up project scaffolding',
    stateId: 's3',
    priority: Priority.High,
    sortOrder: 0,
    startDate: daysFromNow(-5),
    dueDate: daysFromNow(2),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'wi-2',
    projectId: 'proj-1',
    sequenceId: 2,
    identifierPrefix: 'FE',
    title: 'Implement auth flow',
    stateId: 's2',
    priority: Priority.High,
    sortOrder: 1,
    startDate: daysFromNow(1),
    dueDate: daysFromNow(10),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'wi-3',
    projectId: 'proj-1',
    sequenceId: 3,
    identifierPrefix: 'FE',
    title: 'Design dashboard layout',
    stateId: 's1',
    priority: Priority.Medium,
    sortOrder: 2,
    startDate: daysFromNow(5),
    dueDate: daysFromNow(15),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'wi-4',
    projectId: 'proj-1',
    sequenceId: 4,
    identifierPrefix: 'FE',
    title: 'Build API endpoints',
    stateId: 's2',
    priority: Priority.Urgent,
    sortOrder: 3,
    startDate: daysFromNow(8),
    dueDate: daysFromNow(20),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'wi-5',
    projectId: 'proj-1',
    sequenceId: 5,
    identifierPrefix: 'FE',
    title: 'Write unit tests',
    stateId: 's1',
    priority: Priority.Low,
    sortOrder: 4,
    startDate: daysFromNow(15),
    dueDate: daysFromNow(25),
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const mockRelations: TimelineRelation[] = [
  {
    id: 'rel-1',
    sourceWorkItemId: 'wi-1',
    targetWorkItemId: 'wi-2',
    relationType: RelationType.Blocking,
  },
  {
    id: 'rel-2',
    sourceWorkItemId: 'wi-2',
    targetWorkItemId: 'wi-4',
    relationType: RelationType.Blocking,
  },
];

const meta: Meta<typeof TimelineView> = {
  title: 'PM/TimelineView',
  component: TimelineView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onItemClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-full" style={{ minWidth: 900 }}>
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
    relations: mockRelations,
    projectPrefix: 'FE',
  },
};

export const NoRelations: Story = {
  args: {
    workItems: mockWorkItems,
    states: mockStates,
    relations: [],
    projectPrefix: 'FE',
  },
};

export const SingleItem: Story = {
  args: {
    workItems: [mockWorkItems[0]],
    states: mockStates,
    relations: [],
    projectPrefix: 'FE',
  },
};

export const Empty: Story = {
  args: {
    workItems: [],
    states: mockStates,
    relations: [],
    projectPrefix: 'FE',
  },
};
