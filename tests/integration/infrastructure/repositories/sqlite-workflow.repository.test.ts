/**
 * Workflow Repository Integration Tests
 *
 * Tests for the SQLite implementation of IWorkflowRepository.
 * Verifies CRUD operations, query methods, filtering, soft-delete, and database mapping.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteWorkflowRepository } from '@/infrastructure/repositories/sqlite-workflow.repository.js';
import type { ScheduledWorkflow } from '@/domain/generated/output.js';

describe('SQLiteWorkflowRepository', () => {
  let db: Database.Database;
  let repository: SQLiteWorkflowRepository;

  const createTestWorkflow = (overrides?: Partial<ScheduledWorkflow>): ScheduledWorkflow => ({
    id: 'wf-1',
    name: 'issue-triage',
    description: 'Triage open GitHub issues',
    prompt: 'Scan all open issues and close resolved ones',
    toolConstraints: ['git', 'github'],
    cronExpression: '0 9 * * MON',
    timezone: 'America/New_York',
    enabled: true,
    repositoryPath: '/home/user/project',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'scheduled_workflows')).toBe(true);
    repository = new SQLiteWorkflowRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create()', () => {
    it('should create a workflow record', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.id).toBe('wf-1');
      expect(row.name).toBe('issue-triage');
      expect(row.prompt).toBe('Scan all open issues and close resolved ones');
      expect(row.repository_path).toBe('/home/user/project');
    });

    it('should store toolConstraints as JSON string', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row.tool_constraints).toBe(JSON.stringify(['git', 'github']));
    });

    it('should store enabled as 1', async () => {
      const workflow = createTestWorkflow({ enabled: true });
      await repository.create(workflow);

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row.enabled).toBe(1);
    });

    it('should store timestamps as unix milliseconds', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row.created_at).toBe(new Date('2026-01-01T00:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    });

    it('should store optional fields as NULL when not provided', async () => {
      const workflow = createTestWorkflow({
        description: undefined,
        toolConstraints: undefined,
        cronExpression: undefined,
        timezone: undefined,
        lastRunAt: undefined,
        nextRunAt: undefined,
      });
      await repository.create(workflow);

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row.description).toBeNull();
      expect(row.tool_constraints).toBeNull();
      expect(row.cron_expression).toBeNull();
      expect(row.timezone).toBeNull();
      expect(row.last_run_at).toBeNull();
      expect(row.next_run_at).toBeNull();
    });
  });

  describe('findById()', () => {
    it('should find workflow by ID', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const found = await repository.findById('wf-1');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('wf-1');
      expect(found?.name).toBe('issue-triage');
      expect(found?.repositoryPath).toBe('/home/user/project');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent');
      expect(found).toBeNull();
    });

    it('should correctly map timestamps back to Date objects', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const found = await repository.findById('wf-1');

      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found?.updatedAt).toBeInstanceOf(Date);
      expect((found?.createdAt as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('should correctly parse toolConstraints from JSON', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);

      const found = await repository.findById('wf-1');
      expect(found?.toolConstraints).toEqual(['git', 'github']);
    });

    it('should map enabled integer back to boolean', async () => {
      const workflow = createTestWorkflow({ enabled: true });
      await repository.create(workflow);

      const found = await repository.findById('wf-1');
      expect(found?.enabled).toBe(true);
    });

    it('should not include optional fields when they are NULL', async () => {
      const workflow = createTestWorkflow({
        description: undefined,
        toolConstraints: undefined,
        cronExpression: undefined,
        timezone: undefined,
        lastRunAt: undefined,
        nextRunAt: undefined,
      });
      await repository.create(workflow);

      const found = await repository.findById('wf-1');
      expect(found?.description).toBeUndefined();
      expect(found?.toolConstraints).toBeUndefined();
      expect(found?.cronExpression).toBeUndefined();
      expect(found?.timezone).toBeUndefined();
      expect(found?.lastRunAt).toBeUndefined();
      expect(found?.nextRunAt).toBeUndefined();
    });

    it('should return null for soft-deleted workflow', async () => {
      const workflow = createTestWorkflow();
      await repository.create(workflow);
      await repository.softDelete('wf-1');

      const found = await repository.findById('wf-1');
      expect(found).toBeNull();
    });
  });

  describe('findByName()', () => {
    it('should find workflow by name and repository path', async () => {
      await repository.create(createTestWorkflow());

      const found = await repository.findByName('issue-triage', '/home/user/project');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('wf-1');
      expect(found?.name).toBe('issue-triage');
    });

    it('should return null for wrong repository path', async () => {
      await repository.create(createTestWorkflow());

      const found = await repository.findByName('issue-triage', '/other/path');
      expect(found).toBeNull();
    });

    it('should return null for non-existent name', async () => {
      await repository.create(createTestWorkflow());

      const found = await repository.findByName('non-existent', '/home/user/project');
      expect(found).toBeNull();
    });

    it('should return null for soft-deleted workflow', async () => {
      await repository.create(createTestWorkflow());
      await repository.softDelete('wf-1');

      const found = await repository.findByName('issue-triage', '/home/user/project');
      expect(found).toBeNull();
    });
  });

  describe('findEnabled()', () => {
    it('should return only enabled non-deleted workflows', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'enabled-1' }));
      await repository.create(
        createTestWorkflow({ id: 'wf-2', name: 'disabled-1', enabled: false })
      );
      await repository.create(createTestWorkflow({ id: 'wf-3', name: 'enabled-2' }));

      const enabled = await repository.findEnabled();

      expect(enabled).toHaveLength(2);
      expect(enabled[0].id).toBe('wf-1');
      expect(enabled[1].id).toBe('wf-3');
    });

    it('should exclude soft-deleted enabled workflows', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'enabled-1' }));
      await repository.create(createTestWorkflow({ id: 'wf-2', name: 'enabled-2' }));
      await repository.softDelete('wf-2');

      const enabled = await repository.findEnabled();

      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('wf-1');
    });

    it('should return empty array when no enabled workflows exist', async () => {
      await repository.create(
        createTestWorkflow({ id: 'wf-1', name: 'disabled-1', enabled: false })
      );

      const enabled = await repository.findEnabled();
      expect(enabled).toEqual([]);
    });
  });

  describe('list()', () => {
    it('should list all non-deleted workflows', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'wf-a' }));
      await repository.create(createTestWorkflow({ id: 'wf-2', name: 'wf-b' }));

      const workflows = await repository.list();
      expect(workflows).toHaveLength(2);
    });

    it('should return empty array when no workflows exist', async () => {
      const workflows = await repository.list();
      expect(workflows).toEqual([]);
    });

    it('should filter by repositoryPath', async () => {
      await repository.create(
        createTestWorkflow({ id: 'wf-1', name: 'wf-a', repositoryPath: '/repo/a' })
      );
      await repository.create(
        createTestWorkflow({ id: 'wf-2', name: 'wf-b', repositoryPath: '/repo/b' })
      );

      const workflows = await repository.list({ repositoryPath: '/repo/a' });

      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('wf-1');
    });

    it('should filter by enabled state', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'wf-a', enabled: true }));
      await repository.create(createTestWorkflow({ id: 'wf-2', name: 'wf-b', enabled: false }));

      const enabledOnly = await repository.list({ enabled: true });
      expect(enabledOnly).toHaveLength(1);
      expect(enabledOnly[0].id).toBe('wf-1');

      const disabledOnly = await repository.list({ enabled: false });
      expect(disabledOnly).toHaveLength(1);
      expect(disabledOnly[0].id).toBe('wf-2');
    });

    it('should exclude soft-deleted workflows by default', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'wf-a' }));
      await repository.create(createTestWorkflow({ id: 'wf-2', name: 'wf-b' }));
      await repository.softDelete('wf-2');

      const workflows = await repository.list();
      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('wf-1');
    });

    it('should include soft-deleted workflows when includeDeleted is true', async () => {
      await repository.create(createTestWorkflow({ id: 'wf-1', name: 'wf-a' }));
      await repository.create(createTestWorkflow({ id: 'wf-2', name: 'wf-b' }));
      await repository.softDelete('wf-2');

      const workflows = await repository.list({ includeDeleted: true });
      expect(workflows).toHaveLength(2);
    });
  });

  describe('update()', () => {
    it('should update workflow fields', async () => {
      await repository.create(createTestWorkflow());
      const updated = createTestWorkflow({
        description: 'Updated description',
        enabled: false,
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      });

      await repository.update(updated);

      const found = await repository.findById('wf-1');
      expect(found?.description).toBe('Updated description');
      expect(found?.enabled).toBe(false);
      expect((found?.updatedAt as Date).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('should update cronExpression and nextRunAt', async () => {
      await repository.create(createTestWorkflow());
      const nextRun = new Date('2026-03-20T09:00:00Z');
      const updated = createTestWorkflow({
        cronExpression: '0 9 * * *',
        nextRunAt: nextRun,
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      });

      await repository.update(updated);

      const found = await repository.findById('wf-1');
      expect(found?.cronExpression).toBe('0 9 * * *');
      expect(found?.nextRunAt).toEqual(nextRun);
    });
  });

  describe('softDelete()', () => {
    it('should set deleted_at timestamp', async () => {
      await repository.create(createTestWorkflow());

      await repository.softDelete('wf-1');

      const row = db
        .prepare('SELECT * FROM scheduled_workflows WHERE id = ?')
        .get('wf-1') as Record<string, unknown>;
      expect(row.deleted_at).not.toBeNull();
      expect(typeof row.deleted_at).toBe('number');
    });

    it('should make workflow invisible to findById', async () => {
      await repository.create(createTestWorkflow());
      await repository.softDelete('wf-1');

      const found = await repository.findById('wf-1');
      expect(found).toBeNull();
    });

    it('should not throw when soft-deleting non-existent ID', async () => {
      await expect(repository.softDelete('non-existent')).resolves.not.toThrow();
    });
  });
});
