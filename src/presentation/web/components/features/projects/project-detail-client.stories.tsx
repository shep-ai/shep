import type { Meta, StoryObj } from '@storybook/react';
import { ProjectDetailClient } from './project-detail-client';
import { EstimateType, StateGroup, Priority } from '@shepai/core/domain/generated/output';
import type {
  PmProject,
  WorkItem,
  WorkItemState,
  Label,
} from '@shepai/core/domain/generated/output';

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
    sortOrder: 1,
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
    sortOrder: 2,
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
    sortOrder: 3,
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
    sortOrder: 4,
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

const meta: Meta<typeof ProjectDetailClient> = {
  title: 'Features/ProjectDetailClient',
  component: ProjectDetailClient,
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
    workItems: mockWorkItems,
    states: mockStates,
    labels: mockLabels,
  },
};

export const EmptyProject: Story = {
  args: {
    project: { ...mockProject, workItemCounter: 0 },
    workItems: [],
    states: mockStates,
    labels: [],
  },
};

export const ManyItems: Story = {
  args: {
    project: { ...mockProject, workItemCounter: 20 },
    workItems: Array.from({ length: 20 }, (_, i) => ({
      id: `wi-${i}`,
      projectId: 'proj-1',
      sequenceId: i + 1,
      identifierPrefix: 'FE',
      title: `Work item ${i + 1}: ${['Fix bug', 'Add feature', 'Refactor code', 'Write tests', 'Update docs'][i % 5]}`,
      stateId: mockStates[i % mockStates.length].id,
      priority: [Priority.Urgent, Priority.High, Priority.Medium, Priority.Low, Priority.None][
        i % 5
      ],
      sortOrder: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    states: mockStates,
    labels: mockLabels,
  },
};
