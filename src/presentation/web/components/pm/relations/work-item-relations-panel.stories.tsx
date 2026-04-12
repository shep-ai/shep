import type { Meta, StoryObj } from '@storybook/react';
import { WorkItemRelationsPanel } from './work-item-relations-panel';
import { Priority, RelationType } from '@shepai/core/domain/generated/output';
import type { WorkItem } from '@shepai/core/domain/generated/output';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';

const mockWorkItems: WorkItem[] = [
  {
    id: 'wi-1',
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'FE',
    title: 'Set up project scaffolding',
    stateId: 's1',
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
    stateId: 's2',
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
    stateId: 's3',
    priority: Priority.Low,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockWorkItemsMap = new Map(mockWorkItems.map((wi) => [wi.id, wi]));

const mockRelations: WorkItemRelation[] = [
  {
    id: 'rel-1',
    sourceWorkItemId: 'wi-1',
    targetWorkItemId: 'wi-2',
    relationType: RelationType.Blocking,
    createdAt: new Date(),
  },
  {
    id: 'rel-2',
    sourceWorkItemId: 'wi-1',
    targetWorkItemId: 'wi-3',
    relationType: RelationType.RelatesTo,
    createdAt: new Date(),
  },
  {
    id: 'rel-3',
    sourceWorkItemId: 'wi-2',
    targetWorkItemId: 'wi-1',
    relationType: RelationType.Duplicate,
    createdAt: new Date(),
  },
];

const meta: Meta<typeof WorkItemRelationsPanel> = {
  title: 'PM/WorkItemRelationsPanel',
  component: WorkItemRelationsPanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-80 rounded-lg border p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRelations: Story = {
  args: {
    workItemId: 'wi-1',
    workItemsMap: mockWorkItemsMap,
    projectPrefix: 'FE',
    initialRelations: mockRelations,
  },
};

export const Empty: Story = {
  args: {
    workItemId: 'wi-no-relations',
    workItemsMap: mockWorkItemsMap,
    projectPrefix: 'FE',
  },
};

export const Loading: Story = {
  args: {
    workItemId: 'wi-1',
    workItemsMap: mockWorkItemsMap,
    projectPrefix: 'FE',
  },
};
