import type { Meta, StoryObj } from '@storybook/react';
import { SdlcBoardClient } from './sdlc-board-client';
import { TaskState, SdlcLifecycle, BuildMode } from '@shepai/core/domain/generated/output';
import type { SdlcTask, SdlcSubTask, Feature } from '@shepai/core/domain/generated/output';
import type { SdlcBoardEpic } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';

// ---------------------------------------------------------------------------
// Fixtures (same as sdlc-board.stories.tsx)
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');

function makeFeature(
  id: string,
  name: string,
  slug: string,
  overrides?: Partial<Feature>
): Feature {
  return {
    id,
    name,
    slug,
    userQuery: `Implement ${name}`,
    description: `Feature: ${name}`,
    repositoryPath: '/repos/shep',
    branch: `feat/${slug}`,
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTask(
  id: string,
  featureId: string,
  title: string,
  status: TaskState,
  sortOrder: number,
  opts?: Partial<SdlcTask>
): SdlcTask {
  return {
    id,
    featureId,
    taskKey: id,
    title,
    status,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}

function makeSubTask(
  id: string,
  taskId: string,
  featureId: string,
  name: string,
  status: TaskState,
  sortOrder: number
): SdlcSubTask {
  return {
    id,
    taskId,
    featureId,
    subTaskKey: id,
    name,
    status,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

const epic1Tasks = [
  {
    task: makeTask('t1-1', 'feat-1', 'Add TypeSpec domain models', TaskState.Done, 1),
    subTasks: [
      makeSubTask('s1-1', 't1-1', 'feat-1', 'Define SdlcTask model', TaskState.Done, 1),
      makeSubTask('s1-2', 't1-1', 'feat-1', 'Define SdlcSubTask model', TaskState.Done, 2),
    ],
  },
  {
    task: makeTask('t1-2', 'feat-1', 'Create SQLite persistence layer', TaskState.WIP, 2, {
      dependsOnKeys: ['t1-1'],
      branch: 'feat/sdlc-persistence',
    }),
    subTasks: [
      makeSubTask('s1-3', 't1-2', 'feat-1', 'Write migrations', TaskState.Done, 1),
      makeSubTask('s1-4', 't1-2', 'feat-1', 'Implement repository', TaskState.WIP, 2),
    ],
  },
  {
    task: makeTask('t1-3', 'feat-1', 'Add /sdlc route + sidebar nav', TaskState.Todo, 3, {
      dependsOnKeys: ['t1-2'],
    }),
    subTasks: [],
  },
];

const epic1: SdlcBoardEpic = {
  feature: makeFeature('feat-1', 'SDLC Kanban Board', 'sdlc-kanban-board', {
    userQuery: 'Make agent SDLC visible via a kanban board',
    branch: 'claude/zen-albattani-xpwz6',
  }),
  tasks: epic1Tasks,
};

const epic2Tasks = [
  {
    task: makeTask('t2-1', 'feat-2', 'Implement PR diff fetcher', TaskState.Review, 1),
    subTasks: [
      makeSubTask('s2-1', 't2-1', 'feat-2', 'GitHub API integration', TaskState.Done, 1),
      makeSubTask('s2-2', 't2-1', 'feat-2', 'Diff parser', TaskState.Review, 2),
    ],
  },
  {
    task: makeTask('t2-2', 'feat-2', 'Post review comments', TaskState.Todo, 2, {
      dependsOnKeys: ['t2-1'],
    }),
    subTasks: [],
  },
];

const epic2: SdlcBoardEpic = {
  feature: makeFeature('feat-2', 'Autonomous PR Review', 'autonomous-pr-review'),
  tasks: epic2Tasks,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof SdlcBoardClient> = {
  title: 'Features/SDLC Board/SdlcBoardClient',
  component: SdlcBoardClient,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[700px] w-full overflow-hidden p-4">
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

/** Board populated with two epics and tasks across all columns. */
export const Default: Story = {
  args: {
    initialEpics: [epic1, epic2],
  },
};

/** Empty board — shows the "No active agent work yet" empty state. */
export const Empty: Story = {
  args: {
    initialEpics: [],
  },
};
