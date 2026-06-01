/**
 * SQLiteSdlcSubTaskRepository Integration Tests (SDLC Kanban Board — Phase 2).
 *
 * Uses an in-memory SQLite database with full migrations applied.
 * Exercises every method including non-default field values and
 * upsertByKey idempotency.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSdlcSubTaskRepository } from '@/infrastructure/repositories/sqlite-sdlc-subtask.repository.js';
import type { SdlcSubTask } from '@/domain/generated/output.js';
import { TaskState } from '@/domain/generated/output.js';

describe('SQLiteSdlcSubTaskRepository', () => {
  let db: Database.Database;
  let repo: SQLiteSdlcSubTaskRepository;

  const NOW = new Date('2026-05-01T10:00:00Z');

  function makeSubTask(overrides: Partial<SdlcSubTask> = {}): SdlcSubTask {
    return {
      id: 'sub-001',
      taskId: 'task-parent',
      featureId: 'feature-abc',
      subTaskKey: 'subtask-1',
      name: 'Write unit tests',
      description: 'Cover all edge cases',
      status: TaskState.Review,
      sortOrder: 2.5,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'sdlc_subtasks')).toBe(true);
    repo = new SQLiteSdlcSubTaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('roundtrips all fields including non-default values', async () => {
      await repo.create(makeSubTask());

      const found = await repo.findById('sub-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('sub-001');
      expect(found!.taskId).toBe('task-parent');
      expect(found!.featureId).toBe('feature-abc');
      expect(found!.subTaskKey).toBe('subtask-1');
      expect(found!.name).toBe('Write unit tests');
      expect(found!.description).toBe('Cover all edge cases');
      expect(found!.status).toBe(TaskState.Review);
      expect(found!.sortOrder).toBe(2.5);
      expect(found!.createdAt).toEqual(NOW);
      expect(found!.updatedAt).toEqual(NOW);
    });

    it('roundtrips a sub-task with no optional fields', async () => {
      await repo.create(makeSubTask({ id: 'sub-002', description: undefined }));

      const found = await repo.findById('sub-002');
      expect(found).not.toBeNull();
      expect(found!.description).toBeUndefined();
    });

    it('returns null for a nonexistent id', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listByTask()', () => {
    it('returns only sub-tasks for the given task, ordered by sort_order ASC', async () => {
      await repo.create(makeSubTask({ id: 's-1', subTaskKey: 'sub-1', sortOrder: 3.0 }));
      await repo.create(makeSubTask({ id: 's-2', subTaskKey: 'sub-2', sortOrder: 1.0 }));
      await repo.create(
        makeSubTask({
          id: 's-other',
          subTaskKey: 'sub-1',
          taskId: 'other-task',
          sortOrder: 0.5,
        })
      );

      const results = await repo.listByTask('task-parent');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('s-2');
      expect(results[1].id).toBe('s-1');
    });

    it('returns empty array when no sub-tasks exist for the task', async () => {
      const results = await repo.listByTask('nonexistent-task');
      expect(results).toHaveLength(0);
    });
  });

  describe('listByFeature()', () => {
    it('returns all sub-tasks for the given feature, ordered by sort_order ASC', async () => {
      await repo.create(
        makeSubTask({ id: 's-1', subTaskKey: 'sub-1', taskId: 'task-a', sortOrder: 3.0 })
      );
      await repo.create(
        makeSubTask({ id: 's-2', subTaskKey: 'sub-2', taskId: 'task-b', sortOrder: 1.0 })
      );
      await repo.create(
        makeSubTask({
          id: 's-other',
          subTaskKey: 'sub-1',
          taskId: 'task-other',
          featureId: 'other-feature',
          sortOrder: 0.5,
        })
      );

      const results = await repo.listByFeature('feature-abc');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('s-2');
      expect(results[1].id).toBe('s-1');
    });

    it('returns empty array when no sub-tasks exist for the feature', async () => {
      const results = await repo.listByFeature('nonexistent-feature');
      expect(results).toHaveLength(0);
    });
  });

  describe('upsertByKey()', () => {
    it('inserts a new row when key does not exist', async () => {
      await repo.upsertByKey('upsert-id-1', 'task-parent', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Initial name',
        description: 'Initial desc',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });

      const found = await repo.findById('upsert-id-1');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Initial name');
      expect(found!.status).toBe(TaskState.Todo);
      expect(found!.featureId).toBe('feature-abc');
    });

    it('updates mutable fields when key already exists (idempotent)', async () => {
      await repo.upsertByKey('upsert-id-1', 'task-parent', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Original name',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });

      await repo.upsertByKey('upsert-id-2', 'task-parent', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Updated name',
        description: 'Now has a description',
        status: TaskState.WIP,
        sortOrder: 2.0,
      });

      // Should still be only one row
      const all = await repo.listByTask('task-parent');
      expect(all).toHaveLength(1);

      // Row should use original id (not second call's id)
      const found = await repo.findById('upsert-id-1');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Updated name');
      expect(found!.description).toBe('Now has a description');
      expect(found!.status).toBe(TaskState.WIP);
      expect(found!.sortOrder).toBe(2.0);
    });

    it('allows different sub_task_keys to coexist under the same task', async () => {
      await repo.upsertByKey('id-1', 'task-parent', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Sub One',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });
      await repo.upsertByKey('id-2', 'task-parent', 'subtask-2', {
        featureId: 'feature-abc',
        name: 'Sub Two',
        status: TaskState.Done,
        sortOrder: 2.0,
      });

      const all = await repo.listByTask('task-parent');
      expect(all).toHaveLength(2);
    });

    it('same sub_task_key under different tasks are independent rows', async () => {
      await repo.upsertByKey('id-1', 'task-a', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Sub in task-a',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });
      await repo.upsertByKey('id-2', 'task-b', 'subtask-1', {
        featureId: 'feature-abc',
        name: 'Sub in task-b',
        status: TaskState.Done,
        sortOrder: 1.0,
      });

      const allByFeature = await repo.listByFeature('feature-abc');
      expect(allByFeature).toHaveLength(2);
    });
  });

  describe('updateStatus()', () => {
    it('changes the sub-task status and bumps updated_at', async () => {
      await repo.create(makeSubTask({ status: TaskState.Todo, updatedAt: NOW }));

      await repo.updateStatus('sub-001', TaskState.Done);

      const found = await repo.findById('sub-001');
      expect(found!.status).toBe(TaskState.Done);
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });

    it('can transition through all TaskState values', async () => {
      await repo.create(makeSubTask({ status: TaskState.Todo }));

      for (const state of [TaskState.WIP, TaskState.Review, TaskState.Done]) {
        await repo.updateStatus('sub-001', state);
        const found = await repo.findById('sub-001');
        expect(found!.status).toBe(state);
      }
    });
  });

  describe('updateSortOrder()', () => {
    it('changes the sort order and bumps updated_at', async () => {
      await repo.create(makeSubTask({ sortOrder: 1.0, updatedAt: NOW }));

      await repo.updateSortOrder('sub-001', 88.25);

      const found = await repo.findById('sub-001');
      expect(found!.sortOrder).toBe(88.25);
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });
  });

  describe('create() — date handling', () => {
    it('stores and retrieves dates with millisecond precision', async () => {
      const precise = new Date('2026-05-15T12:34:56.789Z');
      await repo.create(makeSubTask({ createdAt: precise, updatedAt: precise }));

      const found = await repo.findById('sub-001');
      expect(found!.createdAt.getTime()).toBe(precise.getTime());
      expect(found!.updatedAt.getTime()).toBe(precise.getTime());
    });
  });
});
