/**
 * SQLiteNotificationRepository Integration Tests
 *
 * Tests for the SQLite implementation of INotificationRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteNotificationRepository } from '@/infrastructure/repositories/sqlite-notification.repository.js';
import { SQLitePmProjectRepository } from '@/infrastructure/repositories/sqlite-pm-project.repository.js';
import { PmNotificationType, EstimateType } from '@/domain/generated/output.js';
import type { PmNotification, PmProject } from '@/domain/generated/output.js';

describe('SQLiteNotificationRepository', () => {
  let db: Database.Database;
  let notifRepo: SQLiteNotificationRepository;
  let projectRepo: SQLitePmProjectRepository;

  const NOW = new Date('2026-04-01T10:00:00Z');
  const PROJECT_ID = 'proj-001';
  const RECIPIENT_ID = 'user-001';

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

  function createTestNotification(overrides: Partial<PmNotification> = {}): PmNotification {
    return {
      id: 'notif-001',
      projectId: PROJECT_ID,
      recipientId: RECIPIENT_ID,
      type: PmNotificationType.Assignment,
      title: 'You were assigned TST-1',
      isRead: false,
      isArchived: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'pm_notifications')).toBe(true);
    notifRepo = new SQLiteNotificationRepository(db);
    projectRepo = new SQLitePmProjectRepository(db);

    await projectRepo.create(createTestProject());
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a notification by id', async () => {
      const notif = createTestNotification();
      await notifRepo.create(notif);

      const found = await notifRepo.findById('notif-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('notif-001');
      expect(found!.title).toBe('You were assigned TST-1');
      expect(found!.recipientId).toBe(RECIPIENT_ID);
      expect(found!.type).toBe('Assignment');
      expect(found!.isRead).toBe(false);
      expect(found!.isArchived).toBe(false);
    });

    it('returns null for nonexistent id', async () => {
      const result = await notifRepo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const notif = createTestNotification({
        body: 'Work item TST-1 was assigned to you by system',
        referenceId: 'wi-001',
        referenceType: 'WorkItem',
      });
      await notifRepo.create(notif);

      const found = await notifRepo.findById('notif-001');
      expect(found!.body).toBe('Work item TST-1 was assigned to you by system');
      expect(found!.referenceId).toBe('wi-001');
      expect(found!.referenceType).toBe('WorkItem');
    });
  });

  describe('listByRecipient()', () => {
    it('returns empty array when no notifications exist', async () => {
      const result = await notifRepo.listByRecipient(RECIPIENT_ID);
      expect(result).toHaveLength(0);
    });

    it('returns non-archived notifications for recipient', async () => {
      await notifRepo.create(createTestNotification({ id: 'notif-001' }));
      await notifRepo.create(createTestNotification({ id: 'notif-002', title: 'State change' }));
      await notifRepo.archive('notif-002');

      const result = await notifRepo.listByRecipient(RECIPIENT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notif-001');
    });

    it('filters by unread only', async () => {
      await notifRepo.create(createTestNotification({ id: 'notif-001' }));
      await notifRepo.create(createTestNotification({ id: 'notif-002', title: 'Another' }));
      await notifRepo.markRead('notif-001');

      const unread = await notifRepo.listByRecipient(RECIPIENT_ID, { unreadOnly: true });
      expect(unread).toHaveLength(1);
      expect(unread[0].id).toBe('notif-002');
    });

    it('filters by project id', async () => {
      const otherProjectId = 'proj-002';
      await projectRepo.create(
        createTestProject({ id: otherProjectId, slug: 'other', identifierPrefix: 'OTH' })
      );

      await notifRepo.create(createTestNotification({ id: 'notif-001', projectId: PROJECT_ID }));
      await notifRepo.create(
        createTestNotification({ id: 'notif-002', projectId: otherProjectId })
      );

      const result = await notifRepo.listByRecipient(RECIPIENT_ID, { projectId: PROJECT_ID });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notif-001');
    });

    it('respects limit parameter', async () => {
      await notifRepo.create(createTestNotification({ id: 'notif-001' }));
      await notifRepo.create(createTestNotification({ id: 'notif-002', title: 'Second' }));
      await notifRepo.create(createTestNotification({ id: 'notif-003', title: 'Third' }));

      const result = await notifRepo.listByRecipient(RECIPIENT_ID, { limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe('markRead()', () => {
    it('marks a notification as read', async () => {
      await notifRepo.create(createTestNotification());
      await notifRepo.markRead('notif-001');

      const found = await notifRepo.findById('notif-001');
      expect(found!.isRead).toBe(true);
    });
  });

  describe('markAllRead()', () => {
    it('marks all unread notifications as read for recipient', async () => {
      await notifRepo.create(createTestNotification({ id: 'notif-001' }));
      await notifRepo.create(createTestNotification({ id: 'notif-002', title: 'Second' }));

      await notifRepo.markAllRead(RECIPIENT_ID);

      const unread = await notifRepo.listByRecipient(RECIPIENT_ID, { unreadOnly: true });
      expect(unread).toHaveLength(0);
    });

    it('scopes to project when projectId is provided', async () => {
      const otherProjectId = 'proj-002';
      await projectRepo.create(
        createTestProject({ id: otherProjectId, slug: 'other', identifierPrefix: 'OTH' })
      );

      await notifRepo.create(createTestNotification({ id: 'notif-001', projectId: PROJECT_ID }));
      await notifRepo.create(
        createTestNotification({ id: 'notif-002', projectId: otherProjectId })
      );

      await notifRepo.markAllRead(RECIPIENT_ID, PROJECT_ID);

      const all = await notifRepo.listByRecipient(RECIPIENT_ID, { unreadOnly: true });
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('notif-002');
    });
  });

  describe('archive()', () => {
    it('archives a notification so it no longer appears in list', async () => {
      await notifRepo.create(createTestNotification());
      await notifRepo.archive('notif-001');

      const result = await notifRepo.listByRecipient(RECIPIENT_ID);
      expect(result).toHaveLength(0);
    });
  });

  describe('countUnread()', () => {
    it('returns correct unread count', async () => {
      await notifRepo.create(createTestNotification({ id: 'notif-001' }));
      await notifRepo.create(createTestNotification({ id: 'notif-002', title: 'Second' }));
      await notifRepo.create(createTestNotification({ id: 'notif-003', title: 'Third' }));
      await notifRepo.markRead('notif-001');

      const count = await notifRepo.countUnread(RECIPIENT_ID);
      expect(count).toBe(2);
    });

    it('scopes count to project when provided', async () => {
      const otherProjectId = 'proj-002';
      await projectRepo.create(
        createTestProject({ id: otherProjectId, slug: 'other', identifierPrefix: 'OTH' })
      );

      await notifRepo.create(createTestNotification({ id: 'notif-001', projectId: PROJECT_ID }));
      await notifRepo.create(
        createTestNotification({ id: 'notif-002', projectId: otherProjectId })
      );

      const count = await notifRepo.countUnread(RECIPIENT_ID, PROJECT_ID);
      expect(count).toBe(1);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes a notification so it is no longer returned', async () => {
      await notifRepo.create(createTestNotification());
      await notifRepo.softDelete('notif-001');

      const found = await notifRepo.findById('notif-001');
      expect(found).toBeNull();
    });
  });
});
