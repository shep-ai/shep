/**
 * SdlcBoardTracker — unit tests (spec sdlc-board, Phase 3a).
 *
 * Verifies the infrastructure adapter that bridges the feature-agent to the
 * SDLC Board:
 * - seedTasks: upserts tasks + sub-tasks with correct args; defaults status to Todo.
 * - setTaskStatus: resolves task by key then calls updateStatus.
 * - setSubTaskStatus: resolves task then sub-task by key then calls updateStatus.
 * - Both set* methods are no-ops when the key is not found (graceful).
 *
 * TDD: tests were written before the implementation (RED → GREEN).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdlcBoardTracker } from '@/infrastructure/services/agents/sdlc-board-tracker.js';
import type { ISdlcTaskRepository } from '@/application/ports/output/repositories/sdlc-task-repository.interface.js';
import type { ISdlcSubTaskRepository } from '@/application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import type { SeedTask } from '@/application/ports/output/agents/sdlc-board-tracker.interface.js';
import { TaskState } from '@/domain/generated/output.js';
import type { SdlcTask, SdlcSubTask } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskRepo(): ISdlcTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    listByFeature: vi.fn().mockResolvedValue([]),
    listAllActive: vi.fn().mockResolvedValue([]),
    upsertByKey: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateSortOrder: vi.fn().mockResolvedValue(undefined),
    deleteByFeature: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSubTaskRepo(): ISdlcSubTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    listByTask: vi.fn().mockResolvedValue([]),
    listByFeature: vi.fn().mockResolvedValue([]),
    upsertByKey: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateSortOrder: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTask(overrides: Partial<SdlcTask> = {}): SdlcTask {
  return {
    id: 'task-uuid-1',
    featureId: 'feat-1',
    taskKey: 'task-1',
    title: 'Task One',
    status: TaskState.Todo,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SdlcTask;
}

function makeSubTask(overrides: Partial<SdlcSubTask> = {}): SdlcSubTask {
  return {
    id: 'subtask-uuid-1',
    taskId: 'task-uuid-1',
    featureId: 'feat-1',
    subTaskKey: 'subtask-1',
    name: 'Sub-task One',
    status: TaskState.Todo,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SdlcSubTask;
}

// UUID regex for non-deterministic ID assertions
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SdlcBoardTracker', () => {
  let taskRepo: ISdlcTaskRepository;
  let subTaskRepo: ISdlcSubTaskRepository;
  let tracker: SdlcBoardTracker;

  beforeEach(() => {
    taskRepo = makeTaskRepo();
    subTaskRepo = makeSubTaskRepo();
    tracker = new SdlcBoardTracker(taskRepo, subTaskRepo);
  });

  // -------------------------------------------------------------------------
  // seedTasks
  // -------------------------------------------------------------------------

  describe('seedTasks', () => {
    it('calls taskRepo.upsertByKey once per task', async () => {
      const tasks: SeedTask[] = [
        {
          taskKey: 'task-1',
          title: 'Task One',
          sortOrder: 1,
          subTasks: [],
        },
        {
          taskKey: 'task-2',
          title: 'Task Two',
          sortOrder: 2,
          subTasks: [],
        },
      ];

      await tracker.seedTasks('feat-1', tasks);

      expect(taskRepo.upsertByKey).toHaveBeenCalledTimes(2);
    });

    it('passes correct positional args to taskRepo.upsertByKey', async () => {
      const tasks: SeedTask[] = [
        {
          taskKey: 'task-1',
          title: 'Task One',
          description: 'Desc',
          sortOrder: 10,
          branch: 'feat/task-1',
          dependsOnKeys: ['task-0'],
          agentRunId: 'run-42',
          subTasks: [],
        },
      ];

      await tracker.seedTasks('feat-1', tasks);

      const [id, featureId, taskKey, fields] = (taskRepo.upsertByKey as ReturnType<typeof vi.fn>)
        .mock.calls[0];

      expect(UUID_RE.test(id)).toBe(true);
      expect(featureId).toBe('feat-1');
      expect(taskKey).toBe('task-1');
      expect(fields).toMatchObject({
        title: 'Task One',
        description: 'Desc',
        status: TaskState.Todo, // default when omitted
        sortOrder: 10,
        branch: 'feat/task-1',
        dependsOnKeys: ['task-0'],
        agentRunId: 'run-42',
      });
    });

    it('defaults status to TaskState.Todo when omitted', async () => {
      const tasks: SeedTask[] = [
        { taskKey: 'task-1', title: 'Task One', sortOrder: 1, subTasks: [] },
      ];

      await tracker.seedTasks('feat-1', tasks);

      const [, , , fields] = (taskRepo.upsertByKey as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fields.status).toBe(TaskState.Todo);
    });

    it('preserves an explicit status when provided', async () => {
      const tasks: SeedTask[] = [
        { taskKey: 'task-1', title: 'T', sortOrder: 1, status: TaskState.WIP, subTasks: [] },
      ];

      await tracker.seedTasks('feat-1', tasks);

      const [, , , fields] = (taskRepo.upsertByKey as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fields.status).toBe(TaskState.WIP);
    });

    it('calls subTaskRepo.upsertByKey once per sub-task across all tasks', async () => {
      const tasks: SeedTask[] = [
        {
          taskKey: 'task-1',
          title: 'Task One',
          sortOrder: 1,
          subTasks: [
            { subTaskKey: 'st-1', name: 'ST One', sortOrder: 1 },
            { subTaskKey: 'st-2', name: 'ST Two', sortOrder: 2 },
          ],
        },
        {
          taskKey: 'task-2',
          title: 'Task Two',
          sortOrder: 2,
          subTasks: [{ subTaskKey: 'st-3', name: 'ST Three', sortOrder: 1 }],
        },
      ];

      await tracker.seedTasks('feat-1', tasks);

      expect(subTaskRepo.upsertByKey).toHaveBeenCalledTimes(3);
    });

    it('passes correct positional args to subTaskRepo.upsertByKey', async () => {
      const tasks: SeedTask[] = [
        {
          taskKey: 'task-1',
          title: 'Task One',
          sortOrder: 1,
          subTasks: [
            {
              subTaskKey: 'st-1',
              name: 'ST One',
              description: 'Sub desc',
              sortOrder: 5,
              status: TaskState.Review,
            },
          ],
        },
      ];

      await tracker.seedTasks('feat-1', tasks);

      const [id, taskId, subTaskKey, fields] = (subTaskRepo.upsertByKey as ReturnType<typeof vi.fn>)
        .mock.calls[0];

      expect(UUID_RE.test(id)).toBe(true);
      // taskId should be the UUID generated for the parent task (also a UUID)
      expect(UUID_RE.test(taskId)).toBe(true);
      expect(subTaskKey).toBe('st-1');
      expect(fields).toMatchObject({
        featureId: 'feat-1',
        name: 'ST One',
        description: 'Sub desc',
        status: TaskState.Review,
        sortOrder: 5,
      });
    });

    it('defaults sub-task status to TaskState.Todo when omitted', async () => {
      const tasks: SeedTask[] = [
        {
          taskKey: 'task-1',
          title: 'T',
          sortOrder: 1,
          subTasks: [{ subTaskKey: 'st-1', name: 'S', sortOrder: 1 }],
        },
      ];

      await tracker.seedTasks('feat-1', tasks);

      const [, , , fields] = (subTaskRepo.upsertByKey as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fields.status).toBe(TaskState.Todo);
    });

    it('is a no-op for empty tasks array', async () => {
      await tracker.seedTasks('feat-1', []);
      expect(taskRepo.upsertByKey).not.toHaveBeenCalled();
      expect(subTaskRepo.upsertByKey).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setTaskStatus
  // -------------------------------------------------------------------------

  describe('setTaskStatus', () => {
    it('calls taskRepo.updateStatus with the resolved id and new status', async () => {
      const task = makeTask({ id: 'task-uuid-1', taskKey: 'task-1' });
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([task]);

      await tracker.setTaskStatus('feat-1', 'task-1', TaskState.WIP);

      expect(taskRepo.listByFeature).toHaveBeenCalledWith('feat-1');
      expect(taskRepo.updateStatus).toHaveBeenCalledWith('task-uuid-1', TaskState.WIP);
    });

    it('is a no-op when taskKey is not found', async () => {
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeTask({ taskKey: 'task-other' }),
      ]);

      await expect(
        tracker.setTaskStatus('feat-1', 'task-missing', TaskState.Done)
      ).resolves.toBeUndefined();

      expect(taskRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('is a no-op when feature has no tasks', async () => {
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(
        tracker.setTaskStatus('feat-1', 'task-1', TaskState.Done)
      ).resolves.toBeUndefined();

      expect(taskRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setSubTaskStatus
  // -------------------------------------------------------------------------

  describe('setSubTaskStatus', () => {
    it('calls subTaskRepo.updateStatus with the resolved id and new status', async () => {
      const task = makeTask({ id: 'task-uuid-1', taskKey: 'task-1' });
      const subTask = makeSubTask({
        id: 'subtask-uuid-1',
        taskId: 'task-uuid-1',
        subTaskKey: 'st-1',
      });
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
      (subTaskRepo.listByTask as ReturnType<typeof vi.fn>).mockResolvedValue([subTask]);

      await tracker.setSubTaskStatus('feat-1', 'task-1', 'st-1', TaskState.Done);

      expect(taskRepo.listByFeature).toHaveBeenCalledWith('feat-1');
      expect(subTaskRepo.listByTask).toHaveBeenCalledWith('task-uuid-1');
      expect(subTaskRepo.updateStatus).toHaveBeenCalledWith('subtask-uuid-1', TaskState.Done);
    });

    it('is a no-op when the parent taskKey is not found', async () => {
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeTask({ taskKey: 'task-other' }),
      ]);

      await expect(
        tracker.setSubTaskStatus('feat-1', 'task-missing', 'st-1', TaskState.Done)
      ).resolves.toBeUndefined();

      expect(subTaskRepo.listByTask).not.toHaveBeenCalled();
      expect(subTaskRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('is a no-op when the subTaskKey is not found', async () => {
      const task = makeTask({ id: 'task-uuid-1', taskKey: 'task-1' });
      (taskRepo.listByFeature as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
      (subTaskRepo.listByTask as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSubTask({ subTaskKey: 'st-other' }),
      ]);

      await expect(
        tracker.setSubTaskStatus('feat-1', 'task-1', 'st-missing', TaskState.Done)
      ).resolves.toBeUndefined();

      expect(subTaskRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
