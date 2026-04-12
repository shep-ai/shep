import type { Meta, StoryObj } from '@storybook/react';
import { CreateWorkItemDialog } from './create-work-item-dialog';
import { StateGroup } from '@shepai/core/domain/generated/output';
import type { WorkItemState } from '@shepai/core/domain/generated/output';

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

const meta: Meta<typeof CreateWorkItemDialog> = {
  title: 'Features/CreateWorkItemDialog',
  component: CreateWorkItemDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    projectId: 'proj-1',
    states: mockStates,
    onCreated: () => undefined,
  },
};
