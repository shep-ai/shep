import type { Meta, StoryObj } from '@storybook/react';
import { CalendarView } from './calendar-view';
import { Priority, StateGroup } from '@shepai/core/domain/generated/output';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';
import { fn } from '@storybook/test';

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

function createWorkItem(
  overrides: Partial<WorkItem> & { sequenceId: number; title: string }
): WorkItem {
  return {
    id: `wi-${overrides.sequenceId}`,
    projectId: 'proj-1',
    identifierPrefix: 'CAL',
    stateId: 's1',
    priority: Priority.Medium,
    sortOrder: overrides.sequenceId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Build mock items spread across the current month */
function buildCurrentMonthItems(): WorkItem[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return [
    createWorkItem({
      sequenceId: 1,
      title: 'Design system review',
      stateId: 's2',
      priority: Priority.High,
      startDate: new Date(year, month, 3),
    }),
    createWorkItem({
      sequenceId: 2,
      title: 'API endpoint refactor',
      stateId: 's2',
      priority: Priority.Urgent,
      startDate: new Date(year, month, 5),
      dueDate: new Date(year, month, 10),
    }),
    createWorkItem({
      sequenceId: 3,
      title: 'Write unit tests for auth module',
      stateId: 's1',
      priority: Priority.Medium,
      startDate: new Date(year, month, 8),
    }),
    createWorkItem({
      sequenceId: 4,
      title: 'Fix pagination bug',
      stateId: 's3',
      priority: Priority.High,
      dueDate: new Date(year, month, 10),
    }),
    createWorkItem({
      sequenceId: 5,
      title: 'Update dependencies',
      stateId: 's1',
      priority: Priority.Low,
      startDate: new Date(year, month, 15),
    }),
    createWorkItem({
      sequenceId: 6,
      title: 'Performance optimization',
      stateId: 's2',
      priority: Priority.Medium,
      startDate: new Date(year, month, 15),
    }),
    createWorkItem({
      sequenceId: 7,
      title: 'Database migration script',
      stateId: 's1',
      priority: Priority.High,
      startDate: new Date(year, month, 15),
    }),
    createWorkItem({
      sequenceId: 8,
      title: 'Deploy staging environment',
      stateId: 's2',
      priority: Priority.Medium,
      startDate: new Date(year, month, 15),
    }),
    createWorkItem({
      sequenceId: 9,
      title: 'User acceptance testing',
      stateId: 's1',
      priority: Priority.Low,
      startDate: new Date(year, month, 20),
    }),
    createWorkItem({
      sequenceId: 10,
      title: 'Release notes draft',
      stateId: 's1',
      priority: Priority.None,
      dueDate: new Date(year, month, 25),
    }),
  ];
}

const meta: Meta<typeof CalendarView> = {
  title: 'PM/CalendarView',
  component: CalendarView,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onWorkItemUpdate: fn(),
    onItemClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workItems: buildCurrentMonthItems(),
    states: mockStates,
    projectPrefix: 'CAL',
  },
};

export const EmptyMonth: Story = {
  args: {
    workItems: [],
    states: mockStates,
    projectPrefix: 'CAL',
  },
};

export const MonthNavigation: Story = {
  args: {
    workItems: buildCurrentMonthItems(),
    states: mockStates,
    projectPrefix: 'CAL',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Use the chevron buttons to navigate between months. ' +
          'The "Today" button returns to the current month.',
      },
    },
  },
};
