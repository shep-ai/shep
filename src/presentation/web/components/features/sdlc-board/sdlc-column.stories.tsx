import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SdlcColumn } from './sdlc-column';
import { TaskState } from '@shepai/core/domain/generated/output';
import type { SdlcTask, SdlcSubTask } from '@shepai/core/domain/generated/output';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');

function makeSubTask(
  id: string,
  taskId: string,
  name: string,
  status: TaskState,
  sortOrder: number
): SdlcSubTask {
  return {
    id,
    taskId,
    featureId: 'feat-1',
    subTaskKey: id,
    name,
    status,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTask(
  id: string,
  title: string,
  status: TaskState,
  sortOrder: number,
  opts?: Partial<SdlcTask>
): SdlcTask {
  return {
    id,
    featureId: 'feat-1',
    taskKey: id,
    title,
    status,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}

const task1 = makeTask('task-1', 'Implement kanban board UI components', TaskState.WIP, 1, {
  branch: 'feat/sdlc-board-ui',
});
const task2 = makeTask('task-2', 'Set up SSE streaming for board updates', TaskState.WIP, 2, {
  dependsOnKeys: ['task-1'],
});

const subTasksForTask1: SdlcSubTask[] = [
  makeSubTask('sub-1', 'task-1', 'Create SdlcCard component', TaskState.Done, 1),
  makeSubTask('sub-2', 'task-1', 'Create SdlcColumn component', TaskState.Done, 2),
  makeSubTask('sub-3', 'task-1', 'Create SdlcBoard with DnD', TaskState.WIP, 3),
];

const subTasksForTask2: SdlcSubTask[] = [
  makeSubTask('sub-4', 'task-2', 'Add SSE route', TaskState.Todo, 1),
  makeSubTask('sub-5', 'task-2', 'Write client hook', TaskState.Todo, 2),
];

const columnTasks = [
  { task: task1, subTasks: subTasksForTask1, epicName: 'SDLC Kanban Board' },
  { task: task2, subTasks: subTasksForTask2, epicName: 'SDLC Kanban Board' },
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof SdlcColumn> = {
  title: 'Features/SDLC Board/SdlcColumn',
  component: SdlcColumn,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onCardClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    status: TaskState.WIP,
    title: 'In Progress',
    tasks: columnTasks,
  },
};

export const Empty: Story = {
  args: {
    status: TaskState.Todo,
    title: 'Todo',
    tasks: [],
  },
};

export const DoneColumn: Story = {
  args: {
    status: TaskState.Done,
    title: 'Done',
    tasks: [
      {
        task: makeTask('task-done-1', 'Set up project scaffolding', TaskState.Done, 1),
        subTasks: [
          makeSubTask('sub-done-1', 'task-done-1', 'Init repo', TaskState.Done, 1),
          makeSubTask('sub-done-2', 'task-done-1', 'Configure TypeSpec', TaskState.Done, 2),
        ],
        epicName: 'Foundation Work',
      },
    ],
  },
};

export const ReviewColumn: Story = {
  args: {
    status: TaskState.Review,
    title: 'Review',
    tasks: [
      {
        task: makeTask('task-rev-1', 'PR: Add SDLC board migrations', TaskState.Review, 1, {
          dependsOnKeys: ['task-1'],
        }),
        subTasks: [
          makeSubTask('sub-rev-1', 'task-rev-1', 'Write migration 105', TaskState.Done, 1),
          makeSubTask('sub-rev-2', 'task-rev-1', 'Write migration 106', TaskState.Done, 2),
          makeSubTask('sub-rev-3', 'task-rev-1', 'Add integration tests', TaskState.Review, 3),
        ],
        epicName: 'SDLC Kanban Board',
      },
    ],
  },
};
