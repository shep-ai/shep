import type { Meta, StoryObj } from '@storybook/react';
import { WorkItemDetailClient } from './work-item-detail-client';
import {
  EstimateType,
  StateGroup,
  Priority,
  RelationType,
} from '@shepai/core/domain/generated/output';
import type { PmProject, WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';

const mockProject: PmProject = {
  id: 'proj-1',
  name: 'Frontend Redesign',
  slug: 'frontend-redesign',
  identifierPrefix: 'FE',
  workItemCounter: 5,
  estimateType: EstimateType.Category,
  description: 'Complete redesign of the user-facing frontend.',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
};

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

const mockWorkItem: WorkItem = {
  id: 'wi-1',
  projectId: 'proj-1',
  sequenceId: 1,
  identifierPrefix: 'FE',
  title: 'Set up project scaffolding',
  description: 'Initialize the project with the required build tools and folder structure.',
  stateId: 's2',
  priority: Priority.High,
  sortOrder: 0,
  startDate: new Date('2024-02-01'),
  dueDate: new Date('2024-02-15'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockChildItems: WorkItem[] = [
  {
    id: 'wi-child-1',
    projectId: 'proj-1',
    sequenceId: 10,
    identifierPrefix: 'FE',
    title: 'Configure webpack',
    stateId: 's1',
    priority: Priority.Medium,
    sortOrder: 0,
    parentId: 'wi-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-child-2',
    projectId: 'proj-1',
    sequenceId: 11,
    identifierPrefix: 'FE',
    title: 'Set up linting rules',
    stateId: 's3',
    priority: Priority.Low,
    sortOrder: 1,
    parentId: 'wi-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockRelatedItem: WorkItem = {
  id: 'wi-2',
  projectId: 'proj-1',
  sequenceId: 2,
  identifierPrefix: 'FE',
  title: 'Design component library',
  stateId: 's2',
  priority: Priority.Medium,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const allWorkItems = [mockWorkItem, ...mockChildItems, mockRelatedItem];

const mockRelations: WorkItemRelation[] = [
  {
    id: 'rel-1',
    sourceWorkItemId: 'wi-1',
    targetWorkItemId: 'wi-2',
    relationType: RelationType.Blocking,
    createdAt: new Date(),
  },
];

const meta: Meta<typeof WorkItemDetailClient> = {
  title: 'Features/WorkItemDetailClient',
  component: WorkItemDetailClient,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    project: mockProject,
    workItem: mockWorkItem,
    allWorkItems,
    states: mockStates,
    relations: mockRelations,
  },
};

export const NoRelationsOrSubItems: Story = {
  args: {
    project: mockProject,
    workItem: { ...mockWorkItem, description: undefined },
    allWorkItems: [mockWorkItem],
    states: mockStates,
    relations: [],
  },
};

export const WithSubItemsOnly: Story = {
  args: {
    project: mockProject,
    workItem: mockWorkItem,
    allWorkItems: [mockWorkItem, ...mockChildItems],
    states: mockStates,
    relations: [],
  },
};
