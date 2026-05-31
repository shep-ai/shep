import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SdlcBoard } from './sdlc-board';
import { TaskState, SdlcLifecycle, BuildMode } from '@shepai/core/domain/generated/output';
import type { SdlcTask, SdlcSubTask, Feature } from '@shepai/core/domain/generated/output';
import type { SdlcBoardEpic } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T10:00:00Z');

/** Minimal valid Feature fixture — all required fields populated. */
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

// Epic 1: SDLC Kanban Board feature
const epic1Tasks = [
  {
    task: makeTask('t1-1', 'feat-1', 'Add TypeSpec domain models', TaskState.Done, 1),
    subTasks: [
      makeSubTask('s1-1', 't1-1', 'feat-1', 'Define SdlcTask model', TaskState.Done, 1),
      makeSubTask('s1-2', 't1-1', 'feat-1', 'Define SdlcSubTask model', TaskState.Done, 2),
      makeSubTask('s1-3', 't1-1', 'feat-1', 'Run tsp:codegen', TaskState.Done, 3),
    ],
  },
  {
    task: makeTask('t1-2', 'feat-1', 'Create SQLite persistence layer', TaskState.Done, 2, {
      dependsOnKeys: ['t1-1'],
    }),
    subTasks: [
      makeSubTask('s1-4', 't1-2', 'feat-1', 'Write migration 105', TaskState.Done, 1),
      makeSubTask('s1-5', 't1-2', 'feat-1', 'Write migration 106', TaskState.Done, 2),
      makeSubTask('s1-6', 't1-2', 'feat-1', 'Implement repository + mapper', TaskState.Done, 3),
    ],
  },
  {
    task: makeTask('t1-3', 'feat-1', 'Implement application use cases', TaskState.WIP, 3, {
      dependsOnKeys: ['t1-2'],
      branch: 'feat/sdlc-board-use-cases',
    }),
    subTasks: [
      makeSubTask('s1-7', 't1-3', 'feat-1', 'ListSdlcBoardUseCase', TaskState.Done, 1),
      makeSubTask('s1-8', 't1-3', 'feat-1', 'UpdateSdlcTaskStatusUseCase', TaskState.Done, 2),
      makeSubTask('s1-9', 't1-3', 'feat-1', 'ReorderSdlcTaskUseCase', TaskState.WIP, 3),
      makeSubTask('s1-10', 't1-3', 'feat-1', 'Unit tests', TaskState.Todo, 4),
    ],
  },
  {
    task: makeTask('t1-4', 'feat-1', 'Build presentational board components', TaskState.WIP, 4, {
      branch: 'feat/sdlc-board-ui',
    }),
    subTasks: [
      makeSubTask('s1-11', 't1-4', 'feat-1', 'SdlcCard', TaskState.Done, 1),
      makeSubTask('s1-12', 't1-4', 'feat-1', 'SdlcColumn', TaskState.Done, 2),
      makeSubTask('s1-13', 't1-4', 'feat-1', 'SdlcBoard with DnD', TaskState.Done, 3),
      makeSubTask('s1-14', 't1-4', 'feat-1', 'Colocated stories', TaskState.WIP, 4),
    ],
  },
  {
    task: makeTask('t1-5', 'feat-1', 'Wire SSE route and client hook', TaskState.Review, 5, {
      dependsOnKeys: ['t1-3'],
      branch: 'feat/sdlc-sse',
    }),
    subTasks: [
      makeSubTask('s1-15', 't1-5', 'feat-1', 'Add /api/sdlc-events route', TaskState.Done, 1),
      makeSubTask('s1-16', 't1-5', 'feat-1', 'Write use-sdlc-events hook', TaskState.Review, 2),
    ],
  },
  {
    task: makeTask('t1-6', 'feat-1', 'Add /sdlc route + sidebar nav', TaskState.Todo, 6, {
      dependsOnKeys: ['t1-4', 't1-5'],
    }),
    subTasks: [],
  },
];

const epic1: SdlcBoardEpic = {
  feature: makeFeature('feat-1', 'SDLC Kanban Board', 'sdlc-kanban-board', {
    userQuery: 'Make agent SDLC visible via a kanban board',
    description: 'First-class persisted tasks streaming live agent progress onto a kanban board.',
    branch: 'claude/zen-albattani-xpwz6',
  }),
  tasks: epic1Tasks,
};

// Epic 2: Autonomous PR Review
const epic2Tasks = [
  {
    task: makeTask('t2-1', 'feat-2', 'Implement PR diff fetcher', TaskState.Done, 1),
    subTasks: [
      makeSubTask('s2-1', 't2-1', 'feat-2', 'GitHub API integration', TaskState.Done, 1),
      makeSubTask('s2-2', 't2-1', 'feat-2', 'Diff parser', TaskState.Done, 2),
    ],
  },
  {
    task: makeTask('t2-2', 'feat-2', 'Build review agent prompt chain', TaskState.WIP, 2),
    subTasks: [
      makeSubTask('s2-3', 't2-2', 'feat-2', 'Design prompt templates', TaskState.Done, 1),
      makeSubTask('s2-4', 't2-2', 'feat-2', 'Implement agent graph', TaskState.WIP, 2),
      makeSubTask('s2-5', 't2-2', 'feat-2', 'Add test coverage', TaskState.Todo, 3),
    ],
  },
  {
    task: makeTask('t2-3', 'feat-2', 'Post review comments via GitHub API', TaskState.Todo, 3, {
      dependsOnKeys: ['t2-2'],
    }),
    subTasks: [],
  },
];

const epic2: SdlcBoardEpic = {
  feature: makeFeature('feat-2', 'Autonomous PR Review', 'autonomous-pr-review', {
    userQuery: 'Automatically review PRs with AI',
    description: 'AI agent that reviews pull requests and posts inline comments.',
  }),
  tasks: epic2Tasks,
};

// Epic 3: Multi-repo Support
const epic3Tasks = [
  {
    task: makeTask(
      't3-1',
      'feat-3',
      'Extend feature entity with repositoryId',
      TaskState.Review,
      1
    ),
    subTasks: [
      makeSubTask('s3-1', 't3-1', 'feat-3', 'Update TypeSpec', TaskState.Done, 1),
      makeSubTask('s3-2', 't3-1', 'feat-3', 'Add migration', TaskState.Done, 2),
      makeSubTask('s3-3', 't3-1', 'feat-3', 'Update repository mapper', TaskState.Review, 3),
    ],
  },
  {
    task: makeTask(
      't3-2',
      'feat-3',
      'Add repo-selector to create feature form',
      TaskState.Todo,
      2,
      {
        dependsOnKeys: ['t3-1'],
      }
    ),
    subTasks: [],
  },
];

const epic3: SdlcBoardEpic = {
  feature: makeFeature('feat-3', 'Multi-repo Support', 'multi-repo-support', {
    userQuery: 'Support multiple git repositories',
    description: 'Allow agents to work across multiple registered repositories.',
    lifecycle: SdlcLifecycle.Requirements,
    branch: 'feat/multi-repo',
  }),
  tasks: epic3Tasks,
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof SdlcBoard> = {
  title: 'Features/SDLC Board/SdlcBoard',
  component: SdlcBoard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onTaskStatusChange: fn(),
    onCardClick: fn(),
  },
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

/** All columns populated across 3 epics. */
export const Default: Story = {
  args: {
    epics: [epic1, epic2, epic3],
  },
};

/** No epics — shows empty columns in every status. */
export const Empty: Story = {
  args: {
    epics: [],
  },
};

/** Single epic with tasks spread across all 4 statuses. */
export const SingleEpic: Story = {
  args: {
    epics: [epic1],
  },
};

/** All tasks done — every card in the Done column. */
export const AllDone: Story = {
  args: {
    epics: [
      {
        ...epic1,
        tasks: epic1Tasks.map(({ task, subTasks }) => ({
          task: { ...task, status: TaskState.Done },
          subTasks: subTasks.map((s) => ({ ...s, status: TaskState.Done })),
        })),
      },
    ],
  },
};

/** Two epics with tasks in only the WIP column. */
export const WorkInProgress: Story = {
  args: {
    epics: [
      {
        ...epic2,
        tasks: epic2Tasks.map(({ task, subTasks }) => ({
          task: { ...task, status: TaskState.WIP },
          subTasks,
        })),
      },
    ],
  },
};
