import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { StateGroup, Priority } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { SelectableWorkItemRow } from './selectable-work-item-row';
import { BulkSelectionProvider, useBulkSelection } from './bulk-selection-context';

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

const mockWorkItems: WorkItem[] = [
  mockWorkItem,
  {
    id: 'wi-2',
    projectId: 'proj-1',
    sequenceId: 43,
    identifierPrefix: 'FE',
    title: 'Add bulk operations support',
    stateId: 's1',
    priority: Priority.Medium,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-3',
    projectId: 'proj-1',
    sequenceId: 44,
    identifierPrefix: 'FE',
    title: 'Design the settings page layout',
    stateId: 's1',
    priority: Priority.Low,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'wi-4',
    projectId: 'proj-1',
    sequenceId: 45,
    identifierPrefix: 'FE',
    title: 'Fix critical authentication bypass vulnerability in the login flow',
    stateId: 's1',
    priority: Priority.Urgent,
    sortOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

/**
 * Helper that pre-selects specified items on mount.
 */
function PreSelectItems({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const { selectAll } = useBulkSelection();
  useEffect(() => {
    selectAll(ids);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return children;
}

const meta: Meta<typeof SelectableWorkItemRow> = {
  title: 'PM/BulkOperations/SelectableWorkItemRow',
  component: SelectableWorkItemRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <BulkSelectionProvider>
        <div className="rounded-lg border">
          <Story />
        </div>
      </BulkSelectionProvider>
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

export const Selected: Story = {
  args: {
    workItem: mockWorkItem,
    state: mockState,
    projectPrefix: 'FE',
  },
  decorators: [
    (Story) => (
      <PreSelectItems ids={['wi-1']}>
        <Story />
      </PreSelectItems>
    ),
  ],
};

export const MultipleRows: Story = {
  decorators: [
    (_Story) => (
      <div className="divide-y">
        {mockWorkItems.map((wi) => (
          <SelectableWorkItemRow key={wi.id} workItem={wi} state={mockState} projectPrefix="FE" />
        ))}
      </div>
    ),
  ],
};

export const MultipleRowsWithSelection: Story = {
  decorators: [
    (_Story) => (
      <PreSelectItems ids={['wi-1', 'wi-3']}>
        <div className="divide-y">
          {mockWorkItems.map((wi) => (
            <SelectableWorkItemRow key={wi.id} workItem={wi} state={mockState} projectPrefix="FE" />
          ))}
        </div>
      </PreSelectItems>
    ),
  ],
};

export const NoState: Story = {
  args: {
    workItem: mockWorkItem,
    state: undefined,
    projectPrefix: 'FE',
  },
};
