import type { Meta, StoryObj } from '@storybook/react';
import { SubItemsSection } from './sub-items-section';
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
    name: 'In Progress',
    color: '#f59e0b',
    stateGroup: StateGroup.Started,
    displayOrder: 1,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's3',
    projectId: 'proj-1',
    name: 'Done',
    color: '#22c55e',
    stateGroup: StateGroup.Completed,
    displayOrder: 2,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const parentItem: WorkItem = {
  id: 'wi-parent',
  projectId: 'proj-1',
  sequenceId: 1,
  identifierPrefix: 'FE',
  title: 'Parent work item',
  stateId: 's2',
  priority: Priority.High,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const childItems: WorkItem[] = [
  {
    id: 'wi-child-1',
    projectId: 'proj-1',
    sequenceId: 10,
    identifierPrefix: 'FE',
    title: 'Design the login form',
    stateId: 's1',
    priority: Priority.Medium,
    sortOrder: 0,
    parentId: 'wi-parent',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-child-2',
    projectId: 'proj-1',
    sequenceId: 11,
    identifierPrefix: 'FE',
    title: 'Add form validation',
    stateId: 's2',
    priority: Priority.High,
    sortOrder: 1,
    parentId: 'wi-parent',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-child-3',
    projectId: 'proj-1',
    sequenceId: 12,
    identifierPrefix: 'FE',
    title: 'Write unit tests for login',
    stateId: 's3',
    priority: Priority.Low,
    sortOrder: 2,
    parentId: 'wi-parent',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const allWorkItems = [parentItem, ...childItems];

const meta: Meta<typeof SubItemsSection> = {
  title: 'PM/SubItemsSection',
  component: SubItemsSection,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-96 rounded-lg border p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithChildren: Story = {
  args: {
    workItem: parentItem,
    allWorkItems,
    states: mockStates,
    projectPrefix: 'FE',
    projectId: 'proj-1',
    currentDepth: 0,
    onSubItemClick: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    workItem: parentItem,
    allWorkItems: [parentItem],
    states: mockStates,
    projectPrefix: 'FE',
    projectId: 'proj-1',
    currentDepth: 0,
    onSubItemClick: () => undefined,
  },
};

export const AtMaxDepth: Story = {
  args: {
    workItem: parentItem,
    allWorkItems,
    states: mockStates,
    projectPrefix: 'FE',
    projectId: 'proj-1',
    currentDepth: 2,
    onSubItemClick: () => undefined,
  },
};

export const SingleChild: Story = {
  args: {
    workItem: parentItem,
    allWorkItems: [parentItem, childItems[0]],
    states: mockStates,
    projectPrefix: 'FE',
    projectId: 'proj-1',
    currentDepth: 0,
    onSubItemClick: () => undefined,
  },
};
