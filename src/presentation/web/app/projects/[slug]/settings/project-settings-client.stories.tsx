import type { Meta, StoryObj } from '@storybook/react';
import { EstimateType } from '@shepai/core/domain/generated/output';
import { ProjectSettingsClient } from './project-settings-client';

const meta: Meta<typeof ProjectSettingsClient> = {
  title: 'PM/ProjectSettingsClient',
  component: ProjectSettingsClient,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockProject = {
  id: 'proj-1',
  name: 'My Project',
  slug: 'my-project',
  identifierPrefix: 'MP',
  description: 'A sample project for testing',
  workItemCounter: 12,
  estimateType: EstimateType.Points,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  deletedAt: undefined,
};

const mockStates = [
  {
    id: 'st-1',
    projectId: 'proj-1',
    name: 'Backlog',
    color: '#6b7280',
    stateGroup: 'backlog',
    displayOrder: 0,
    isDefault: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
  {
    id: 'st-2',
    projectId: 'proj-1',
    name: 'In Progress',
    color: '#f59e0b',
    stateGroup: 'started',
    displayOrder: 1,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
  {
    id: 'st-3',
    projectId: 'proj-1',
    name: 'Done',
    color: '#22c55e',
    stateGroup: 'completed',
    displayOrder: 2,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
];

const mockLabels = [
  {
    id: 'lbl-1',
    projectId: 'proj-1',
    name: 'bug',
    color: '#ef4444',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
  {
    id: 'lbl-2',
    projectId: 'proj-1',
    name: 'enhancement',
    color: '#3b82f6',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
  {
    id: 'lbl-3',
    projectId: 'proj-1',
    name: 'documentation',
    color: '#8b5cf6',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: undefined,
  },
];

export const Default: Story = {
  args: {
    project: mockProject,
    states: mockStates,
    labels: mockLabels,
  },
};

export const NoLabels: Story = {
  args: {
    project: mockProject,
    states: mockStates,
    labels: [],
  },
};

export const MinimalStates: Story = {
  args: {
    project: { ...mockProject, description: undefined },
    states: [mockStates[0]],
    labels: mockLabels,
  },
};
