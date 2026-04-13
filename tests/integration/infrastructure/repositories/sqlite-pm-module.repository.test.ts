/**
 * SQLitePmModuleRepository Integration Tests
 *
 * Tests for the SQLite implementation of IPmModuleRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLitePmModuleRepository } from '@/infrastructure/repositories/sqlite-pm-module.repository.js';
import { SQLitePmProjectRepository } from '@/infrastructure/repositories/sqlite-pm-project.repository.js';
import { SQLiteWorkItemRepository } from '@/infrastructure/repositories/sqlite-work-item.repository.js';
import { SQLiteWorkItemStateRepository } from '@/infrastructure/repositories/sqlite-work-item-state.repository.js';
import { EstimateType, ModuleStatus, Priority } from '@/domain/generated/output.js';
import type { PmModule, PmProject, WorkItem } from '@/domain/generated/output.js';

describe('SQLitePmModuleRepository', () => {
  let db: Database.Database;
  let moduleRepo: SQLitePmModuleRepository;
  let projectRepo: SQLitePmProjectRepository;
  let workItemRepo: SQLiteWorkItemRepository;
  let stateRepo: SQLiteWorkItemStateRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';

  function createTestProject(overrides: Partial<PmProject> = {}): PmProject {
    return {
      id: PROJECT_ID,
      name: 'Test Project',
      slug: 'test-project',
      identifierPrefix: 'TST',
      workItemCounter: 0,
      estimateType: EstimateType.Category,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function createTestModule(overrides: Partial<PmModule> = {}): PmModule {
    return {
      id: 'mod-001',
      projectId: PROJECT_ID,
      name: 'Module Alpha',
      status: ModuleStatus.Backlog,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function createTestWorkItem(
    id: string,
    stateId: string,
    overrides: Partial<WorkItem> = {}
  ): WorkItem {
    return {
      id,
      projectId: PROJECT_ID,
      sequenceId: 1,
      identifierPrefix: 'TST',
      title: `Work Item ${id}`,
      priority: Priority.Medium,
      stateId,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'pm_modules')).toBe(true);
    expect(tableExists(db, 'module_work_items')).toBe(true);
    moduleRepo = new SQLitePmModuleRepository(db);
    projectRepo = new SQLitePmProjectRepository(db);
    workItemRepo = new SQLiteWorkItemRepository(db);
    stateRepo = new SQLiteWorkItemStateRepository(db);

    // Seed project and default states
    await projectRepo.create(createTestProject());
    await stateRepo.seedDefaultStates(PROJECT_ID);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a module by id', async () => {
      const mod = createTestModule();
      await moduleRepo.create(mod);

      const found = await moduleRepo.findById('mod-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('mod-001');
      expect(found!.name).toBe('Module Alpha');
      expect(found!.projectId).toBe(PROJECT_ID);
      expect(found!.status).toBe('Backlog');
    });

    it('returns null for nonexistent id', async () => {
      const result = await moduleRepo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const mod = createTestModule({
        description: 'Alpha module description',
        leadId: 'user-001',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-06-30'),
      });
      await moduleRepo.create(mod);

      const found = await moduleRepo.findById('mod-001');
      expect(found!.description).toBe('Alpha module description');
      expect(found!.leadId).toBe('user-001');
      expect(found!.startDate).toBeInstanceOf(Date);
      expect(found!.endDate).toBeInstanceOf(Date);
    });
  });

  describe('listByProject()', () => {
    it('returns empty array when no modules exist', async () => {
      const result = await moduleRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(0);
    });

    it('returns only non-deleted modules for the project', async () => {
      await moduleRepo.create(createTestModule({ id: 'mod-001' }));
      await moduleRepo.create(createTestModule({ id: 'mod-002', name: 'Module Beta' }));
      await moduleRepo.softDelete('mod-002');

      const result = await moduleRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mod-001');
    });
  });

  describe('update()', () => {
    it('updates name and status', async () => {
      await moduleRepo.create(createTestModule());
      await moduleRepo.update('mod-001', {
        name: 'Renamed Module',
        status: ModuleStatus.InProgress,
      });

      const found = await moduleRepo.findById('mod-001');
      expect(found!.name).toBe('Renamed Module');
      expect(found!.status).toBe('InProgress');
    });

    it('updates lead and dates', async () => {
      await moduleRepo.create(createTestModule());
      await moduleRepo.update('mod-001', {
        leadId: 'user-002',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-07-31'),
      });

      const found = await moduleRepo.findById('mod-001');
      expect(found!.leadId).toBe('user-002');
      expect(found!.startDate).toBeInstanceOf(Date);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes a module so it is no longer returned', async () => {
      await moduleRepo.create(createTestModule());
      await moduleRepo.softDelete('mod-001');

      const found = await moduleRepo.findById('mod-001');
      expect(found).toBeNull();
    });
  });

  describe('junction operations (module_work_items)', () => {
    it('adds work items to a module and retrieves them', async () => {
      await moduleRepo.create(createTestModule());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', stateId, { sequenceId: 1 }));
      await workItemRepo.create(createTestWorkItem('wi-002', stateId, { sequenceId: 2 }));

      await moduleRepo.addWorkItem('mod-001', 'wi-001');
      await moduleRepo.addWorkItem('mod-001', 'wi-002');

      const ids = await moduleRepo.getWorkItemIds('mod-001');
      expect(ids).toHaveLength(2);
      expect(ids).toContain('wi-001');
      expect(ids).toContain('wi-002');
    });

    it('removes a work item from a module', async () => {
      await moduleRepo.create(createTestModule());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', stateId, { sequenceId: 1 }));

      await moduleRepo.addWorkItem('mod-001', 'wi-001');
      await moduleRepo.removeWorkItem('mod-001', 'wi-001');

      const ids = await moduleRepo.getWorkItemIds('mod-001');
      expect(ids).toHaveLength(0);
    });

    it('allows same work item in multiple modules', async () => {
      await moduleRepo.create(createTestModule({ id: 'mod-001' }));
      await moduleRepo.create(createTestModule({ id: 'mod-002', name: 'Module Beta' }));

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', stateId, { sequenceId: 1 }));

      await moduleRepo.addWorkItem('mod-001', 'wi-001');
      await moduleRepo.addWorkItem('mod-002', 'wi-001');

      const moduleIds = await moduleRepo.getModuleIdsForWorkItem('wi-001');
      expect(moduleIds).toHaveLength(2);
      expect(moduleIds).toContain('mod-001');
      expect(moduleIds).toContain('mod-002');
    });

    it('handles duplicate add gracefully (INSERT OR IGNORE)', async () => {
      await moduleRepo.create(createTestModule());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', stateId, { sequenceId: 1 }));

      await moduleRepo.addWorkItem('mod-001', 'wi-001');
      await moduleRepo.addWorkItem('mod-001', 'wi-001'); // duplicate

      const ids = await moduleRepo.getWorkItemIds('mod-001');
      expect(ids).toHaveLength(1);
    });
  });
});
