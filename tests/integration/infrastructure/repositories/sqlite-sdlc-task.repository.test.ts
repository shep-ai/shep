/**
 * SQLiteSdlcTaskRepository Integration Tests (SDLC Kanban Board — Phase 2).
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
import { SQLiteSdlcTaskRepository } from '@/infrastructure/repositories/sqlite-sdlc-task.repository.js';
import type { SdlcTask } from '@/domain/generated/output.js';
import { TaskState } from '@/domain/generated/output.js';

describe('SQLiteSdlcTaskRepository', () => {
  let db: Database.Database;
  let repo: SQLiteSdlcTaskRepository;

  const NOW = new Date('2026-05-01T10:00:00Z');

  function makeTask(overrides: Partial<SdlcTask> = {}): SdlcTask {
    return {
      id: 'task-001',
      featureId: 'feature-abc',
      taskKey: 'task-1',
      title: 'Implement login',
      description: 'OAuth2 login flow',
      status: TaskState.Review,
      sortOrder: 1.5,
      branch: 'feat/login',
      dependsOnKeys: ['task-0'],
      agentRunId: 'agent-run-xyz',
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'sdlc_tasks')).toBe(true);
    repo = new SQLiteSdlcTaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('roundtrips all fields including non-default values', async () => {
      await repo.create(makeTask());

      const found = await repo.findById('task-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('task-001');
      expect(found!.featureId).toBe('feature-abc');
      expect(found!.taskKey).toBe('task-1');
      expect(found!.title).toBe('Implement login');
      expect(found!.description).toBe('OAuth2 login flow');
      expect(found!.status).toBe(TaskState.Review);
      expect(found!.sortOrder).toBe(1.5);
      expect(found!.branch).toBe('feat/login');
      expect(found!.dependsOnKeys).toEqual(['task-0']);
      expect(found!.agentRunId).toBe('agent-run-xyz');
      expect(found!.createdAt).toEqual(NOW);
      expect(found!.updatedAt).toEqual(NOW);
    });

    it('roundtrips a task with no optional fields', async () => {
      await repo.create(
        makeTask({
          id: 'task-002',
          description: undefined,
          branch: undefined,
          dependsOnKeys: undefined,
          agentRunId: undefined,
        })
      );

      const found = await repo.findById('task-002');
      expect(found).not.toBeNull();
      expect(found!.description).toBeUndefined();
      expect(found!.branch).toBeUndefined();
      expect(found!.dependsOnKeys).toBeUndefined();
      expect(found!.agentRunId).toBeUndefined();
    });

    it('returns null for a nonexistent id', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists dependsOnKeys with multiple entries', async () => {
      await repo.create(makeTask({ dependsOnKeys: ['task-0', 'task-2', 'task-3'] }));

      const found = await repo.findById('task-001');
      expect(found!.dependsOnKeys).toEqual(['task-0', 'task-2', 'task-3']);
    });
  });

  describe('listByFeature()', () => {
    it('returns only tasks for the given feature, ordered by sort_order ASC', async () => {
      await repo.create(makeTask({ id: 't-1', taskKey: 'task-1', sortOrder: 3.0 }));
      await repo.create(makeTask({ id: 't-2', taskKey: 'task-2', sortOrder: 1.0 }));
      await repo.create(
        makeTask({ id: 't-other', taskKey: 'task-3', featureId: 'other-feature', sortOrder: 0.5 })
      );

      const results = await repo.listByFeature('feature-abc');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('t-2');
      expect(results[1].id).toBe('t-1');
    });

    it('returns empty array when no tasks exist for a feature', async () => {
      const results = await repo.listByFeature('nonexistent-feature');
      expect(results).toHaveLength(0);
    });
  });

  describe('listAllActive()', () => {
    it('returns all tasks across features ordered by feature_id then sort_order ASC', async () => {
      await repo.create(
        makeTask({ id: 'f1-t2', featureId: 'feature-1', taskKey: 'task-2', sortOrder: 2.0 })
      );
      await repo.create(
        makeTask({ id: 'f1-t1', featureId: 'feature-1', taskKey: 'task-1', sortOrder: 1.0 })
      );
      await repo.create(
        makeTask({ id: 'f2-t1', featureId: 'feature-2', taskKey: 'task-1', sortOrder: 0.5 })
      );

      const results = await repo.listAllActive();
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('f1-t1');
      expect(results[1].id).toBe('f1-t2');
      expect(results[2].id).toBe('f2-t1');
    });

    it('returns empty array when no tasks exist', async () => {
      const results = await repo.listAllActive();
      expect(results).toHaveLength(0);
    });
  });

  describe('upsertByKey()', () => {
    it('inserts a new row when key does not exist', async () => {
      await repo.upsertByKey('upsert-id-1', 'feature-abc', 'task-1', {
        title: 'Build feature',
        description: 'Do the thing',
        status: TaskState.Todo,
        sortOrder: 1.0,
        branch: 'feat/build',
        dependsOnKeys: ['task-0'],
        agentRunId: 'run-1',
      });

      const found = await repo.findById('upsert-id-1');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Build feature');
      expect(found!.status).toBe(TaskState.Todo);
      expect(found!.dependsOnKeys).toEqual(['task-0']);
    });

    it('updates mutable fields when key already exists (idempotent)', async () => {
      await repo.upsertByKey('upsert-id-1', 'feature-abc', 'task-1', {
        title: 'Original title',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });

      await repo.upsertByKey('upsert-id-2', 'feature-abc', 'task-1', {
        title: 'Updated title',
        description: 'Now with description',
        status: TaskState.WIP,
        sortOrder: 2.0,
        branch: 'feat/updated',
        dependsOnKeys: ['task-a', 'task-b'],
        agentRunId: 'run-2',
      });

      // Should still be only one row
      const all = await repo.listByFeature('feature-abc');
      expect(all).toHaveLength(1);

      // Row should use original id (not second call's id)
      const found = await repo.findById('upsert-id-1');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Updated title');
      expect(found!.description).toBe('Now with description');
      expect(found!.status).toBe(TaskState.WIP);
      expect(found!.sortOrder).toBe(2.0);
      expect(found!.branch).toBe('feat/updated');
      expect(found!.dependsOnKeys).toEqual(['task-a', 'task-b']);
      expect(found!.agentRunId).toBe('run-2');
    });

    it('allows different task_keys to coexist under the same feature', async () => {
      await repo.upsertByKey('id-1', 'feature-abc', 'task-1', {
        title: 'Task One',
        status: TaskState.Todo,
        sortOrder: 1.0,
      });
      await repo.upsertByKey('id-2', 'feature-abc', 'task-2', {
        title: 'Task Two',
        status: TaskState.Done,
        sortOrder: 2.0,
      });

      const all = await repo.listByFeature('feature-abc');
      expect(all).toHaveLength(2);
    });
  });

  describe('updateStatus()', () => {
    it('changes the task status and bumps updated_at', async () => {
      await repo.create(makeTask({ status: TaskState.Todo, updatedAt: NOW }));

      await repo.updateStatus('task-001', TaskState.Done);

      const found = await repo.findById('task-001');
      expect(found!.status).toBe(TaskState.Done);
      // updated_at should be after the original
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });

    it('can transition through all TaskState values', async () => {
      await repo.create(makeTask({ status: TaskState.Todo }));

      for (const state of [TaskState.WIP, TaskState.Review, TaskState.Done]) {
        await repo.updateStatus('task-001', state);
        const found = await repo.findById('task-001');
        expect(found!.status).toBe(state);
      }
    });
  });

  describe('updateSortOrder()', () => {
    it('changes the sort order and bumps updated_at', async () => {
      await repo.create(makeTask({ sortOrder: 1.0, updatedAt: NOW }));

      await repo.updateSortOrder('task-001', 99.5);

      const found = await repo.findById('task-001');
      expect(found!.sortOrder).toBe(99.5);
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });
  });

  describe('deleteByFeature()', () => {
    it('removes all tasks for the given feature and leaves others intact', async () => {
      await repo.create(makeTask({ id: 't-1', taskKey: 'task-1', featureId: 'feature-abc' }));
      await repo.create(makeTask({ id: 't-2', taskKey: 'task-2', featureId: 'feature-abc' }));
      await repo.create(makeTask({ id: 't-3', taskKey: 'task-1', featureId: 'other-feature' }));

      await repo.deleteByFeature('feature-abc');

      expect(await repo.listByFeature('feature-abc')).toHaveLength(0);
      expect(await repo.listByFeature('other-feature')).toHaveLength(1);
    });

    it('is a no-op when no tasks exist for the feature', async () => {
      await expect(repo.deleteByFeature('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('create() — date handling', () => {
    it('stores and retrieves dates with millisecond precision', async () => {
      const precise = new Date('2026-05-15T12:34:56.789Z');
      await repo.create(makeTask({ createdAt: precise, updatedAt: precise }));

      const found = await repo.findById('task-001');
      expect(found!.createdAt.getTime()).toBe(precise.getTime());
      expect(found!.updatedAt.getTime()).toBe(precise.getTime());
    });
  });
});
