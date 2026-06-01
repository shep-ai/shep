/**
 * ListSdlcBoardUseCase Unit Tests
 *
 * Verifies correct nesting of tasks under epics and sub-tasks under tasks,
 * sortOrder ordering, and that a feature with no tasks appears as an empty epic.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListSdlcBoardUseCase } from '@/application/use-cases/sdlc-board/list-sdlc-board.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { ISdlcTaskRepository } from '@/application/ports/output/repositories/sdlc-task-repository.interface.js';
import type { ISdlcSubTaskRepository } from '@/application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import { TaskState, SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { Feature, SdlcTask, SdlcSubTask } from '@/domain/generated/output.js';

function createMockFeatureRepo(): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    findByBranch: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    findByParentId: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
  };
}

function createMockTaskRepo(): ISdlcTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByFeature: vi.fn().mockResolvedValue([]),
    listAllActive: vi.fn().mockResolvedValue([]),
    upsertByKey: vi.fn(),
    updateStatus: vi.fn(),
    updateSortOrder: vi.fn(),
    deleteByFeature: vi.fn(),
  };
}

function createMockSubTaskRepo(): ISdlcSubTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByTask: vi.fn().mockResolvedValue([]),
    listByFeature: vi.fn().mockResolvedValue([]),
    upsertByKey: vi.fn(),
    updateStatus: vi.fn(),
    updateSortOrder: vi.fn(),
  };
}

function makeFeature(id: string): Feature {
  return {
    id,
    name: `Feature ${id}`,
    slug: `feature-${id}`,
    description: 'Test',
    userQuery: 'Build it',
    repositoryPath: '/repo',
    branch: `feat/${id}`,
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
    commitEvidence: false,
    injectSkills: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };
}

function makeTask(id: string, featureId: string, sortOrder: number): SdlcTask {
  return {
    id,
    featureId,
    taskKey: `task-${id}`,
    title: `Task ${id}`,
    status: TaskState.Todo,
    sortOrder,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };
}

function makeSubTask(
  id: string,
  taskId: string,
  featureId: string,
  sortOrder: number
): SdlcSubTask {
  return {
    id,
    taskId,
    featureId,
    subTaskKey: `subtask-${id}`,
    name: `SubTask ${id}`,
    status: TaskState.Todo,
    sortOrder,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };
}

describe('ListSdlcBoardUseCase', () => {
  let useCase: ListSdlcBoardUseCase;
  let featureRepo: IFeatureRepository;
  let taskRepo: ISdlcTaskRepository;
  let subTaskRepo: ISdlcSubTaskRepository;

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    taskRepo = createMockTaskRepo();
    subTaskRepo = createMockSubTaskRepo();
    useCase = new ListSdlcBoardUseCase(featureRepo, taskRepo, subTaskRepo);
  });

  it('returns empty epics list when there are no features', async () => {
    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result.epics).toEqual([]);
  });

  it('includes a feature with no tasks as an empty epic', async () => {
    const feature = makeFeature('feat-1');
    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feature]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.epics).toHaveLength(1);
    expect(result.epics[0].feature.id).toBe('feat-1');
    expect(result.epics[0].tasks).toEqual([]);
  });

  it('groups tasks under their feature epic', async () => {
    const feat1 = makeFeature('feat-1');
    const feat2 = makeFeature('feat-2');
    const task1 = makeTask('t1', 'feat-1', 1);
    const task2 = makeTask('t2', 'feat-2', 1);

    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feat1, feat2]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([task1, task2]);
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.epics).toHaveLength(2);
    const epic1 = result.epics.find((e) => e.feature.id === 'feat-1')!;
    const epic2 = result.epics.find((e) => e.feature.id === 'feat-2')!;
    expect(epic1.tasks).toHaveLength(1);
    expect(epic1.tasks[0].task.id).toBe('t1');
    expect(epic2.tasks).toHaveLength(1);
    expect(epic2.tasks[0].task.id).toBe('t2');
  });

  it('sorts tasks by sortOrder ascending within an epic', async () => {
    const feature = makeFeature('feat-1');
    const taskA = makeTask('tA', 'feat-1', 3);
    const taskB = makeTask('tB', 'feat-1', 1);
    const taskC = makeTask('tC', 'feat-1', 2);

    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feature]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([taskA, taskB, taskC]);
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await useCase.execute();
    const taskIds = result.epics[0].tasks.map((t) => t.task.id);
    expect(taskIds).toEqual(['tB', 'tC', 'tA']);
  });

  it('nests sub-tasks under their parent task', async () => {
    const feature = makeFeature('feat-1');
    const task = makeTask('t1', 'feat-1', 1);
    const sub1 = makeSubTask('s1', 't1', 'feat-1', 1);
    const sub2 = makeSubTask('s2', 't1', 'feat-1', 2);

    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feature]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([sub1, sub2]);

    const result = await useCase.execute();
    const taskNode = result.epics[0].tasks[0];
    expect(taskNode.subTasks).toHaveLength(2);
    expect(taskNode.subTasks[0].id).toBe('s1');
    expect(taskNode.subTasks[1].id).toBe('s2');
  });

  it('sorts sub-tasks by sortOrder ascending within a task', async () => {
    const feature = makeFeature('feat-1');
    const task = makeTask('t1', 'feat-1', 1);
    const subA = makeSubTask('sA', 't1', 'feat-1', 3);
    const subB = makeSubTask('sB', 't1', 'feat-1', 1);
    const subC = makeSubTask('sC', 't1', 'feat-1', 2);

    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feature]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([subA, subB, subC]);

    const result = await useCase.execute();
    const subIds = result.epics[0].tasks[0].subTasks.map((s) => s.id);
    expect(subIds).toEqual(['sB', 'sC', 'sA']);
  });

  it('sub-tasks belonging to tasks in different features are correctly nested', async () => {
    const feat1 = makeFeature('feat-1');
    const feat2 = makeFeature('feat-2');
    const task1 = makeTask('t1', 'feat-1', 1);
    const task2 = makeTask('t2', 'feat-2', 1);
    const sub1 = makeSubTask('s1', 't1', 'feat-1', 1);
    const sub2 = makeSubTask('s2', 't2', 'feat-2', 1);

    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([feat1, feat2]);
    (taskRepo.listAllActive as ReturnType<typeof vi.fn>).mockResolvedValue([task1, task2]);
    // Per feature: feat-1 → [s1], feat-2 → [s2]
    (subTaskRepo.listByFeature as ReturnType<typeof vi.fn>).mockImplementation(
      (featureId: string) => {
        if (featureId === 'feat-1') return Promise.resolve([sub1]);
        if (featureId === 'feat-2') return Promise.resolve([sub2]);
        return Promise.resolve([]);
      }
    );

    const result = await useCase.execute();
    const epic1 = result.epics.find((e) => e.feature.id === 'feat-1')!;
    const epic2 = result.epics.find((e) => e.feature.id === 'feat-2')!;
    expect(epic1.tasks[0].subTasks[0].id).toBe('s1');
    expect(epic2.tasks[0].subTasks[0].id).toBe('s2');
  });

  it('does not call listAllActive when there are no features', async () => {
    (featureRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await useCase.execute();
    // Short-circuit: no features → no need to query tasks
    expect(taskRepo.listAllActive).not.toHaveBeenCalled();
  });

  it('excludes deleted features by default', async () => {
    await useCase.execute();
    expect(featureRepo.list).toHaveBeenCalledWith({ includeDeleted: false });
  });
});
