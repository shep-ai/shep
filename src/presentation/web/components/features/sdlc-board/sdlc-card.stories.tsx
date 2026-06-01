import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SdlcCard } from './sdlc-card';
import { TaskState } from '@shepai/core/domain/generated/output';
import type { SdlcTask, SdlcSubTask } from '@shepai/core/domain/generated/output';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');

const baseTask: SdlcTask = {
  id: 'task-1',
  featureId: 'feat-1',
  taskKey: 'task-1',
  title: 'Implement kanban board UI components',
  description: 'Build the SdlcCard, SdlcColumn, and SdlcBoard presentational components.',
  status: TaskState.WIP,
  sortOrder: 1,
  branch: 'feat/sdlc-board-ui',
  createdAt: now,
  updatedAt: now,
};

const mixedSubTasks: SdlcSubTask[] = [
  {
    id: 'sub-1',
    taskId: 'task-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-1',
    name: 'Create SdlcCard component',
    status: TaskState.Done,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'sub-2',
    taskId: 'task-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-2',
    name: 'Create SdlcColumn component',
    status: TaskState.Done,
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'sub-3',
    taskId: 'task-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-3',
    name: 'Create SdlcBoard with DnD',
    status: TaskState.WIP,
    sortOrder: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'sub-4',
    taskId: 'task-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-4',
    name: 'Write colocated stories',
    status: TaskState.Todo,
    sortOrder: 4,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'sub-5',
    taskId: 'task-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-5',
    name: 'Verify with pnpm build:storybook',
    status: TaskState.Todo,
    sortOrder: 5,
    createdAt: now,
    updatedAt: now,
  },
];

const allDoneSubTasks: SdlcSubTask[] = mixedSubTasks.map((st) => ({
  ...st,
  status: TaskState.Done,
}));

const taskWithDeps: SdlcTask = {
  ...baseTask,
  id: 'task-2',
  taskKey: 'task-2',
  title: 'Set up SSE streaming for board updates',
  status: TaskState.Todo,
  dependsOnKeys: ['task-1', 'task-0'],
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof SdlcCard> = {
  title: 'Features/SDLC Board/SdlcCard',
  component: SdlcCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onClick: fn(),
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
    task: baseTask,
    subTasks: mixedSubTasks,
    epicName: 'SDLC Kanban Board',
  },
};

export const WithDependencies: Story = {
  args: {
    task: taskWithDeps,
    subTasks: [],
    epicName: 'SDLC Kanban Board',
  },
};

export const AllSubTasksDone: Story = {
  args: {
    task: { ...baseTask, status: TaskState.Done },
    subTasks: allDoneSubTasks,
    epicName: 'SDLC Kanban Board',
  },
};

export const ReviewStatus: Story = {
  args: {
    task: { ...baseTask, status: TaskState.Review },
    subTasks: mixedSubTasks.slice(0, 3),
    epicName: 'Autonomous PR Review',
  },
};

export const NoSubTasks: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-3',
      taskKey: 'task-3',
      title: 'Spike: evaluate DnD libraries',
      status: TaskState.Todo,
    },
    subTasks: [],
    epicName: 'Tech Spike',
  },
};
