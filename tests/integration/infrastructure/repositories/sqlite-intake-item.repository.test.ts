/**
 * SQLiteIntakeItemRepository Integration Tests
 *
 * Tests for the SQLite implementation of IIntakeItemRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteIntakeItemRepository } from '@/infrastructure/repositories/sqlite-intake-item.repository.js';
import { SQLitePmProjectRepository } from '@/infrastructure/repositories/sqlite-pm-project.repository.js';
import { SQLiteWorkItemRepository } from '@/infrastructure/repositories/sqlite-work-item.repository.js';
import { SQLiteWorkItemStateRepository } from '@/infrastructure/repositories/sqlite-work-item-state.repository.js';
import { IntakeStatus, EstimateType, Priority } from '@/domain/generated/output.js';
import type { IntakeItem, PmProject, WorkItem } from '@/domain/generated/output.js';

describe('SQLiteIntakeItemRepository', () => {
  let db: Database.Database;
  let intakeRepo: SQLiteIntakeItemRepository;
  let projectRepo: SQLitePmProjectRepository;
  let workItemRepo: SQLiteWorkItemRepository;
  let stateRepo: SQLiteWorkItemStateRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';
  const WORK_ITEM_ID = 'wi-001';

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

  function createTestIntakeItem(overrides: Partial<IntakeItem> = {}): IntakeItem {
    return {
      id: 'intake-001',
      projectId: PROJECT_ID,
      title: 'Bug report from user',
      source: 'manual',
      status: IntakeStatus.Pending,
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
    expect(tableExists(db, 'intake_items')).toBe(true);
    intakeRepo = new SQLiteIntakeItemRepository(db);
    projectRepo = new SQLitePmProjectRepository(db);
    workItemRepo = new SQLiteWorkItemRepository(db);
    stateRepo = new SQLiteWorkItemStateRepository(db);

    await projectRepo.create(createTestProject());

    // Seed work item states and create a work item for FK references
    await stateRepo.seedDefaultStates(PROJECT_ID);
    const states = await stateRepo.listByProject(PROJECT_ID);
    await workItemRepo.create(createTestWorkItem(WORK_ITEM_ID, states[0].id));
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves an intake item by id', async () => {
      const item = createTestIntakeItem();
      await intakeRepo.create(item);

      const found = await intakeRepo.findById('intake-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('intake-001');
      expect(found!.title).toBe('Bug report from user');
      expect(found!.projectId).toBe(PROJECT_ID);
      expect(found!.status).toBe('Pending');
      expect(found!.source).toBe('manual');
    });

    it('returns null for nonexistent id', async () => {
      const result = await intakeRepo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const item = createTestIntakeItem({
        description: 'Detailed bug description',
        triageNotes: 'Looks like a regression',
        suggestedPriority: 'High',
        suggestedLabels: '["label-1","label-2"]',
      });
      await intakeRepo.create(item);

      const found = await intakeRepo.findById('intake-001');
      expect(found!.description).toBe('Detailed bug description');
      expect(found!.triageNotes).toBe('Looks like a regression');
      expect(found!.suggestedPriority).toBe('High');
      expect(found!.suggestedLabels).toBe('["label-1","label-2"]');
    });
  });

  describe('listByProject()', () => {
    it('returns empty array when no intake items exist', async () => {
      const result = await intakeRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(0);
    });

    it('returns only non-deleted items for the project', async () => {
      await intakeRepo.create(createTestIntakeItem({ id: 'intake-001' }));
      await intakeRepo.create(createTestIntakeItem({ id: 'intake-002', title: 'Another report' }));
      await intakeRepo.softDelete('intake-002');

      const result = await intakeRepo.listByProject(PROJECT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('intake-001');
    });

    it('filters by status when provided', async () => {
      await intakeRepo.create(
        createTestIntakeItem({ id: 'intake-001', status: IntakeStatus.Pending })
      );
      await intakeRepo.create(
        createTestIntakeItem({
          id: 'intake-002',
          title: 'Accepted',
          status: IntakeStatus.Accepted,
        })
      );

      const pending = await intakeRepo.listByProject(PROJECT_ID, 'Pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('intake-001');

      const accepted = await intakeRepo.listByProject(PROJECT_ID, 'Accepted');
      expect(accepted).toHaveLength(1);
      expect(accepted[0].id).toBe('intake-002');
    });
  });

  describe('update()', () => {
    it('updates status to Accepted with resulting work item id', async () => {
      await intakeRepo.create(createTestIntakeItem());
      await intakeRepo.update('intake-001', {
        status: IntakeStatus.Accepted,
        resultingWorkItemId: 'wi-001',
      });

      const found = await intakeRepo.findById('intake-001');
      expect(found!.status).toBe('Accepted');
      expect(found!.resultingWorkItemId).toBe('wi-001');
    });

    it('updates status to Declined with reason', async () => {
      await intakeRepo.create(createTestIntakeItem());
      await intakeRepo.update('intake-001', {
        status: IntakeStatus.Declined,
        declineReason: 'Not actionable',
      });

      const found = await intakeRepo.findById('intake-001');
      expect(found!.status).toBe('Declined');
      expect(found!.declineReason).toBe('Not actionable');
    });

    it('updates triage suggestions from AI', async () => {
      await intakeRepo.create(createTestIntakeItem());
      await intakeRepo.update('intake-001', {
        suggestedStateId: 'state-001',
        suggestedPriority: 'High',
        suggestedLabels: '["bug"]',
        suggestedAssigneeId: 'user-1',
        triageNotes: 'AI suggests this is a high-priority bug',
      });

      const found = await intakeRepo.findById('intake-001');
      expect(found!.suggestedStateId).toBe('state-001');
      expect(found!.suggestedPriority).toBe('High');
      expect(found!.suggestedLabels).toBe('["bug"]');
      expect(found!.suggestedAssigneeId).toBe('user-1');
      expect(found!.triageNotes).toBe('AI suggests this is a high-priority bug');
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes an intake item so it is no longer returned', async () => {
      await intakeRepo.create(createTestIntakeItem());
      await intakeRepo.softDelete('intake-001');

      const found = await intakeRepo.findById('intake-001');
      expect(found).toBeNull();
    });
  });
});
