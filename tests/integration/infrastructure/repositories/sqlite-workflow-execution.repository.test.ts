/**
 * Workflow Execution Repository Integration Tests
 *
 * Tests for the SQLite implementation of IWorkflowExecutionRepository.
 * Verifies CRUD operations, query methods, ordering, and retention cleanup.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteWorkflowExecutionRepository } from '@/infrastructure/repositories/sqlite-workflow-execution.repository.js';
import { SQLiteWorkflowRepository } from '@/infrastructure/repositories/sqlite-workflow.repository.js';
import {
  WorkflowTriggerType,
  WorkflowExecutionStatus,
  type WorkflowExecution,
  type ScheduledWorkflow,
} from '@/domain/generated/output.js';

describe('SQLiteWorkflowExecutionRepository', () => {
  let db: Database.Database;
  let executionRepository: SQLiteWorkflowExecutionRepository;
  let workflowRepository: SQLiteWorkflowRepository;

  const createTestWorkflow = (overrides?: Partial<ScheduledWorkflow>): ScheduledWorkflow => ({
    id: 'wf-1',
    name: 'issue-triage',
    prompt: 'Scan all open issues',
    enabled: true,
    repositoryPath: '/home/user/project',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  const createTestExecution = (overrides?: Partial<WorkflowExecution>): WorkflowExecution => ({
    id: 'exec-1',
    workflowId: 'wf-1',
    triggerType: WorkflowTriggerType.Manual,
    status: WorkflowExecutionStatus.Completed,
    startedAt: new Date('2026-03-10T09:00:00Z'),
    completedAt: new Date('2026-03-10T09:05:00Z'),
    durationMs: 300000,
    outputSummary: 'Closed 3 issues',
    createdAt: new Date('2026-03-10T09:00:00Z'),
    updatedAt: new Date('2026-03-10T09:05:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'workflow_executions')).toBe(true);
    workflowRepository = new SQLiteWorkflowRepository(db);
    executionRepository = new SQLiteWorkflowExecutionRepository(db);

    // Create a parent workflow for foreign key
    await workflowRepository.create(createTestWorkflow());
  });

  afterEach(() => {
    db.close();
  });

  describe('create()', () => {
    it('should create an execution record', async () => {
      const execution = createTestExecution();
      await executionRepository.create(execution);

      const row = db
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get('exec-1') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.id).toBe('exec-1');
      expect(row.workflow_id).toBe('wf-1');
      expect(row.trigger_type).toBe('manual');
      expect(row.status).toBe('completed');
    });

    it('should store timestamps as unix milliseconds', async () => {
      const execution = createTestExecution();
      await executionRepository.create(execution);

      const row = db
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get('exec-1') as Record<string, unknown>;
      expect(row.started_at).toBe(new Date('2026-03-10T09:00:00Z').getTime());
      expect(row.completed_at).toBe(new Date('2026-03-10T09:05:00Z').getTime());
    });

    it('should store optional fields as NULL when not provided', async () => {
      const execution = createTestExecution({
        completedAt: undefined,
        durationMs: undefined,
        outputSummary: undefined,
        errorMessage: undefined,
      });
      await executionRepository.create(execution);

      const row = db
        .prepare('SELECT * FROM workflow_executions WHERE id = ?')
        .get('exec-1') as Record<string, unknown>;
      expect(row.completed_at).toBeNull();
      expect(row.duration_ms).toBeNull();
      expect(row.output_summary).toBeNull();
      expect(row.error_message).toBeNull();
    });
  });

  describe('findById()', () => {
    it('should find execution by ID', async () => {
      await executionRepository.create(createTestExecution());

      const found = await executionRepository.findById('exec-1');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('exec-1');
      expect(found?.workflowId).toBe('wf-1');
      expect(found?.triggerType).toBe(WorkflowTriggerType.Manual);
      expect(found?.status).toBe(WorkflowExecutionStatus.Completed);
    });

    it('should return null for non-existent ID', async () => {
      const found = await executionRepository.findById('non-existent');
      expect(found).toBeNull();
    });

    it('should correctly map timestamps back to Date objects', async () => {
      await executionRepository.create(createTestExecution());

      const found = await executionRepository.findById('exec-1');

      expect(found?.startedAt).toBeInstanceOf(Date);
      expect(found?.completedAt).toBeInstanceOf(Date);
      expect(found?.createdAt).toBeInstanceOf(Date);
      expect((found?.startedAt as Date).toISOString()).toBe('2026-03-10T09:00:00.000Z');
    });

    it('should not include optional fields when they are NULL', async () => {
      const execution = createTestExecution({
        completedAt: undefined,
        durationMs: undefined,
        outputSummary: undefined,
        errorMessage: undefined,
      });
      await executionRepository.create(execution);

      const found = await executionRepository.findById('exec-1');
      expect(found?.completedAt).toBeUndefined();
      expect(found?.durationMs).toBeUndefined();
      expect(found?.outputSummary).toBeUndefined();
      expect(found?.errorMessage).toBeUndefined();
    });
  });

  describe('findByWorkflowId()', () => {
    it('should return executions for a workflow ordered by started_at DESC', async () => {
      await executionRepository.create(
        createTestExecution({
          id: 'exec-1',
          startedAt: new Date('2026-03-10T09:00:00Z'),
          createdAt: new Date('2026-03-10T09:00:00Z'),
          updatedAt: new Date('2026-03-10T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-2',
          startedAt: new Date('2026-03-11T09:00:00Z'),
          createdAt: new Date('2026-03-11T09:00:00Z'),
          updatedAt: new Date('2026-03-11T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-3',
          startedAt: new Date('2026-03-12T09:00:00Z'),
          createdAt: new Date('2026-03-12T09:00:00Z'),
          updatedAt: new Date('2026-03-12T09:00:00Z'),
        })
      );

      const executions = await executionRepository.findByWorkflowId('wf-1');

      expect(executions).toHaveLength(3);
      expect(executions[0].id).toBe('exec-3'); // most recent first
      expect(executions[1].id).toBe('exec-2');
      expect(executions[2].id).toBe('exec-1');
    });

    it('should respect limit parameter', async () => {
      await executionRepository.create(
        createTestExecution({
          id: 'exec-1',
          startedAt: new Date('2026-03-10T09:00:00Z'),
          createdAt: new Date('2026-03-10T09:00:00Z'),
          updatedAt: new Date('2026-03-10T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-2',
          startedAt: new Date('2026-03-11T09:00:00Z'),
          createdAt: new Date('2026-03-11T09:00:00Z'),
          updatedAt: new Date('2026-03-11T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-3',
          startedAt: new Date('2026-03-12T09:00:00Z'),
          createdAt: new Date('2026-03-12T09:00:00Z'),
          updatedAt: new Date('2026-03-12T09:00:00Z'),
        })
      );

      const executions = await executionRepository.findByWorkflowId('wf-1', 2);

      expect(executions).toHaveLength(2);
      expect(executions[0].id).toBe('exec-3');
      expect(executions[1].id).toBe('exec-2');
    });

    it('should return empty array when no executions exist for workflow', async () => {
      const executions = await executionRepository.findByWorkflowId('wf-1');
      expect(executions).toEqual([]);
    });

    it('should not return executions from other workflows', async () => {
      // Create a second workflow
      await workflowRepository.create(createTestWorkflow({ id: 'wf-2', name: 'branch-rebase' }));

      await executionRepository.create(createTestExecution({ id: 'exec-1', workflowId: 'wf-1' }));
      await executionRepository.create(createTestExecution({ id: 'exec-2', workflowId: 'wf-2' }));

      const wf1Executions = await executionRepository.findByWorkflowId('wf-1');
      expect(wf1Executions).toHaveLength(1);
      expect(wf1Executions[0].workflowId).toBe('wf-1');
    });
  });

  describe('findByStatus()', () => {
    it('should return only executions matching the given status', async () => {
      await executionRepository.create(
        createTestExecution({
          id: 'exec-1',
          status: WorkflowExecutionStatus.Running,
          startedAt: new Date('2026-03-10T09:00:00Z'),
          createdAt: new Date('2026-03-10T09:00:00Z'),
          updatedAt: new Date('2026-03-10T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-2',
          status: WorkflowExecutionStatus.Completed,
          startedAt: new Date('2026-03-11T09:00:00Z'),
          createdAt: new Date('2026-03-11T09:00:00Z'),
          updatedAt: new Date('2026-03-11T09:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-3',
          status: WorkflowExecutionStatus.Running,
          startedAt: new Date('2026-03-12T09:00:00Z'),
          createdAt: new Date('2026-03-12T09:00:00Z'),
          updatedAt: new Date('2026-03-12T09:00:00Z'),
        })
      );

      const running = await executionRepository.findByStatus(WorkflowExecutionStatus.Running);

      expect(running).toHaveLength(2);
      expect(running[0].status).toBe(WorkflowExecutionStatus.Running);
      expect(running[1].status).toBe(WorkflowExecutionStatus.Running);
    });

    it('should return empty array when no executions match the status', async () => {
      await executionRepository.create(
        createTestExecution({ status: WorkflowExecutionStatus.Completed })
      );

      const queued = await executionRepository.findByStatus(WorkflowExecutionStatus.Queued);
      expect(queued).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update execution status and completedAt', async () => {
      const execution = createTestExecution({
        status: WorkflowExecutionStatus.Running,
        completedAt: undefined,
        durationMs: undefined,
        outputSummary: undefined,
      });
      await executionRepository.create(execution);

      const completedAt = new Date('2026-03-10T09:10:00Z');
      const updated: WorkflowExecution = {
        ...execution,
        status: WorkflowExecutionStatus.Completed,
        completedAt,
        durationMs: 600000,
        outputSummary: 'Done',
        updatedAt: completedAt,
      };
      await executionRepository.update(updated);

      const found = await executionRepository.findById('exec-1');
      expect(found?.status).toBe(WorkflowExecutionStatus.Completed);
      expect(found?.completedAt).toEqual(completedAt);
      expect(found?.durationMs).toBe(600000);
      expect(found?.outputSummary).toBe('Done');
    });

    it('should update error message on failure', async () => {
      const execution = createTestExecution({
        status: WorkflowExecutionStatus.Running,
      });
      await executionRepository.create(execution);

      const updated: WorkflowExecution = {
        ...execution,
        status: WorkflowExecutionStatus.Failed,
        errorMessage: 'GitHub API rate limit exceeded',
        updatedAt: new Date('2026-03-10T09:10:00Z'),
      };
      await executionRepository.update(updated);

      const found = await executionRepository.findById('exec-1');
      expect(found?.status).toBe(WorkflowExecutionStatus.Failed);
      expect(found?.errorMessage).toBe('GitHub API rate limit exceeded');
    });
  });

  describe('deleteOlderThan()', () => {
    it('should delete records older than the given date and return count', async () => {
      await executionRepository.create(
        createTestExecution({
          id: 'exec-old-1',
          startedAt: new Date('2026-01-01T00:00:00Z'),
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-old-2',
          startedAt: new Date('2026-01-15T00:00:00Z'),
          createdAt: new Date('2026-01-15T00:00:00Z'),
          updatedAt: new Date('2026-01-15T00:00:00Z'),
        })
      );
      await executionRepository.create(
        createTestExecution({
          id: 'exec-new',
          startedAt: new Date('2026-03-10T00:00:00Z'),
          createdAt: new Date('2026-03-10T00:00:00Z'),
          updatedAt: new Date('2026-03-10T00:00:00Z'),
        })
      );

      const cutoffDate = new Date('2026-02-01T00:00:00Z');
      const deletedCount = await executionRepository.deleteOlderThan(cutoffDate);

      expect(deletedCount).toBe(2);

      // Verify only the new execution remains
      const remaining = await executionRepository.findByWorkflowId('wf-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('exec-new');
    });

    it('should return 0 when no records are older than the date', async () => {
      await executionRepository.create(
        createTestExecution({
          startedAt: new Date('2026-03-10T00:00:00Z'),
          createdAt: new Date('2026-03-10T00:00:00Z'),
          updatedAt: new Date('2026-03-10T00:00:00Z'),
        })
      );

      const cutoffDate = new Date('2026-01-01T00:00:00Z');
      const deletedCount = await executionRepository.deleteOlderThan(cutoffDate);

      expect(deletedCount).toBe(0);
    });

    it('should return 0 when no records exist', async () => {
      const cutoffDate = new Date('2026-03-10T00:00:00Z');
      const deletedCount = await executionRepository.deleteOlderThan(cutoffDate);
      expect(deletedCount).toBe(0);
    });
  });
});
