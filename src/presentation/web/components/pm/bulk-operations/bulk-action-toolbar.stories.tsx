import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { StateGroup } from '@shepai/core/domain/generated/output';
import type { WorkItemState } from '@shepai/core/domain/generated/output';
import { BulkActionToolbar } from './bulk-action-toolbar';
import { BulkSelectionProvider, useBulkSelection } from './bulk-selection-context';

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

const mockBulkAction = fn(async () => ({
  ok: true,
  succeeded: ['wi-1', 'wi-2', 'wi-3'],
  failed: [],
}));

const mockBulkActionWithFailure = fn(async () => ({
  ok: false,
  succeeded: ['wi-1'],
  failed: [
    { id: 'wi-2', error: 'Item locked' },
    { id: 'wi-3', error: 'Permission denied' },
  ],
}));

/**
 * Helper component that pre-selects items so the toolbar appears.
 */
function PreSelectItems({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const { selectAll } = useBulkSelection();
  useEffect(() => {
    selectAll(ids);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return children;
}

const meta: Meta<typeof BulkActionToolbar> = {
  title: 'PM/BulkOperations/BulkActionToolbar',
  component: BulkActionToolbar,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <BulkSelectionProvider>
        <PreSelectItems ids={['wi-1', 'wi-2', 'wi-3']}>
          <div style={{ minHeight: '200px' }}>
            <Story />
          </div>
        </PreSelectItems>
      </BulkSelectionProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    states: mockStates,
    onBulkAction: mockBulkAction,
  },
};

export const SingleItemSelected: Story = {
  args: {
    states: mockStates,
    onBulkAction: mockBulkAction,
  },
  decorators: [
    (Story) => {
      const { selectAll } = useBulkSelection();
      useEffect(() => {
        selectAll(['wi-1']);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <Story />;
    },
  ],
};

export const WithFailure: Story = {
  args: {
    states: mockStates,
    onBulkAction: mockBulkActionWithFailure,
  },
};

export const ManyItemsSelected: Story = {
  args: {
    states: mockStates,
    onBulkAction: mockBulkAction,
  },
  decorators: [
    (Story) => {
      const { selectAll } = useBulkSelection();
      useEffect(() => {
        selectAll(Array.from({ length: 25 }, (_, i) => `wi-${i + 1}`));
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <Story />;
    },
  ],
};
