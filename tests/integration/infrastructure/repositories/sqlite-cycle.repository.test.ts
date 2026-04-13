/**
 * SQLiteCycleRepository Integration Tests
 *
 * Tests for the SQLite implementation of ICycleRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteCycleRepository } from '@/infrastructure/repositories/sqlite-cycle.repository.js';
import { SQLitePmProjectRepository } from '@/infrastructure/repositories/sqlite-pm-project.repository.js';
import { SQLiteWorkItemRepository } from '@/infrastructure/repositories/sqlite-work-item.repository.js';
import { SQLiteWorkItemStateRepository } from '@/infrastructure/repositories/sqlite-work-item-state.repository.js';
import { CycleStatus, EstimateType, Priority } from '@/domain/generated/output.js';
import type { Cycle, PmProject, WorkItem } from '@/domain/generated/output.js';

describe('SQLiteCycleRepository', () => {
  let db: Database.Database;
  let cycleRepo: SQLiteCycleRepository;
  let projectRepo: SQLitePmProjectRepository;
  let workItemRepo: SQLiteWorkItemRepository;
  let stateRepo: SQLiteWorkItemStateRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';
  let STATE_ID = 'state-001';

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

  function createTestCycle(overrides: Partial<Cycle> = {}): Cycle {
    return {
      id: 'cycle-001',
      projectId: PROJECT_ID,
      name: 'Sprint 1',
      status: CycleStatus.Upcoming,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function createTestWorkItem(id: string, overrides: Partial<WorkItem> = {}): WorkItem {
    return {
      id,
      projectId: PROJECT_ID,
      sequenceId: 1,
      identifierPrefix: 'TST',
      title: `Work Item ${id}`,
      priority: Priority.Medium,
      stateId: STATE_ID,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'cycles')).toBe(true);
    expect(tableExists(db, 'cycle_work_items')).toBe(true);
    cycleRepo = new SQLiteCycleRepository(db);
    projectRepo = new SQLitePmProjectRepository(db);
    workItemRepo = new SQLiteWorkItemRepository(db);
    stateRepo = new SQLiteWorkItemStateRepository(db);

    // Seed project and default states
    await projectRepo.create(createTestProject());
    await stateRepo.seedDefaultStates(PROJECT_ID);
    // Get the default state ID for work items
    const states = await stateRepo.listByProject(PROJECT_ID);
    const todoState = states.find((s) => s.name === 'Todo');
    if (todoState) {
      STATE_ID = todoState.id;
    }
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a cycle by id', async () => {
      const cycle = createTestCycle();
      await cycleRepo.create(cycle);

      const found = await cycleRepo.findById('cycle-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('cycle-001');
      expect(found!.name).toBe('Sprint 1');
      expect(found!.projectId).toBe(PROJECT_ID);
      expect(found!.status).toBe('Upcoming');
    });

    it('returns null for nonexistent id', async () => {
      const result = await cycleRepo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const cycle = createTestCycle({
        description: 'First sprint goals',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-14'),
      });
      await cycleRepo.create(cycle);

      const found = await cycleRepo.findById('cycle-001');
      expect(found!.description).toBe('First sprint goals');
      expect(found!.startDate).toBeInstanceOf(Date);
      expect(found!.endDate).toBeInstanceOf(Date);
    });
  });

  describe('listByProject()', () => {
    it('returns empty array when no cycles exist', async () => {
      const result = await cycleRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(0);
    });

    it('returns only non-deleted cycles for the project', async () => {
      await cycleRepo.create(createTestCycle({ id: 'cycle-001' }));
      await cycleRepo.create(createTestCycle({ id: 'cycle-002', name: 'Sprint 2' }));
      await cycleRepo.softDelete('cycle-002');

      const result = await cycleRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cycle-001');
    });
  });

  describe('findActiveByProject()', () => {
    it('returns the active cycle for a project', async () => {
      await cycleRepo.create(createTestCycle({ id: 'cycle-001', status: CycleStatus.Upcoming }));
      await cycleRepo.create(
        createTestCycle({ id: 'cycle-002', name: 'Sprint 2', status: CycleStatus.Active })
      );

      const active = await cycleRepo.findActiveByProject(PROJECT_ID);
      expect(active).not.toBeNull();
      expect(active!.id).toBe('cycle-002');
      expect(active!.status).toBe('Active');
    });

    it('returns null when no active cycle exists', async () => {
      await cycleRepo.create(createTestCycle({ status: CycleStatus.Upcoming }));
      const active = await cycleRepo.findActiveByProject(PROJECT_ID);
      expect(active).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates name and status', async () => {
      await cycleRepo.create(createTestCycle());
      await cycleRepo.update('cycle-001', { name: 'Renamed Sprint', status: CycleStatus.Active });

      const found = await cycleRepo.findById('cycle-001');
      expect(found!.name).toBe('Renamed Sprint');
      expect(found!.status).toBe('Active');
    });

    it('updates dates', async () => {
      await cycleRepo.create(createTestCycle());
      const newStart = new Date('2026-05-01');
      const newEnd = new Date('2026-05-14');
      await cycleRepo.update('cycle-001', { startDate: newStart, endDate: newEnd });

      const found = await cycleRepo.findById('cycle-001');
      expect(found!.startDate!.getTime()).toBe(newStart.getTime());
      expect(found!.endDate!.getTime()).toBe(newEnd.getTime());
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes a cycle so it is no longer returned', async () => {
      await cycleRepo.create(createTestCycle());
      await cycleRepo.softDelete('cycle-001');

      const found = await cycleRepo.findById('cycle-001');
      expect(found).toBeNull();
    });
  });

  describe('junction operations (cycle_work_items)', () => {
    it('adds work items to a cycle and retrieves them', async () => {
      await cycleRepo.create(createTestCycle());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', { sequenceId: 1, stateId }));
      await workItemRepo.create(createTestWorkItem('wi-002', { sequenceId: 2, stateId }));

      await cycleRepo.addWorkItem('cycle-001', 'wi-001');
      await cycleRepo.addWorkItem('cycle-001', 'wi-002');

      const ids = await cycleRepo.getWorkItemIds('cycle-001');
      expect(ids).toHaveLength(2);
      expect(ids).toContain('wi-001');
      expect(ids).toContain('wi-002');
    });

    it('removes a work item from a cycle', async () => {
      await cycleRepo.create(createTestCycle());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', { sequenceId: 1, stateId }));

      await cycleRepo.addWorkItem('cycle-001', 'wi-001');
      await cycleRepo.removeWorkItem('cycle-001', 'wi-001');

      const ids = await cycleRepo.getWorkItemIds('cycle-001');
      expect(ids).toHaveLength(0);
    });

    it('handles duplicate add gracefully (INSERT OR IGNORE)', async () => {
      await cycleRepo.create(createTestCycle());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', { sequenceId: 1, stateId }));

      await cycleRepo.addWorkItem('cycle-001', 'wi-001');
      await cycleRepo.addWorkItem('cycle-001', 'wi-001'); // duplicate

      const ids = await cycleRepo.getWorkItemIds('cycle-001');
      expect(ids).toHaveLength(1);
    });

    it('finds cycle for a work item', async () => {
      await cycleRepo.create(createTestCycle());

      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', { sequenceId: 1, stateId }));
      await cycleRepo.addWorkItem('cycle-001', 'wi-001');

      const cycleId = await cycleRepo.findCycleForWorkItem(PROJECT_ID, 'wi-001');
      expect(cycleId).toBe('cycle-001');
    });

    it('returns null when work item is not in any cycle', async () => {
      const states = await stateRepo.listByProject(PROJECT_ID);
      const stateId = states[0].id;
      await workItemRepo.create(createTestWorkItem('wi-001', { sequenceId: 1, stateId }));

      const cycleId = await cycleRepo.findCycleForWorkItem(PROJECT_ID, 'wi-001');
      expect(cycleId).toBeNull();
    });
  });
});
