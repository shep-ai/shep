/**
 * SQLiteInteractiveSessionRepository Integration Tests
 *
 * Tests for the SQLite implementation of IInteractiveSessionRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteInteractiveSessionRepository } from '@/infrastructure/repositories/sqlite-interactive-session.repository.js';
import { InteractiveSessionStatus, type InteractiveSession } from '@/domain/generated/output.js';

describe('SQLiteInteractiveSessionRepository', () => {
  let db: Database.Database;
  let repository: SQLiteInteractiveSessionRepository;

  const NOW = new Date('2026-03-22T10:00:00Z');
  const LATER = new Date('2026-03-22T10:05:00Z');

  function createTestSession(overrides: Partial<InteractiveSession> = {}): InteractiveSession {
    return {
      id: 'session-001',
      featureId: 'feature-abc',
      status: InteractiveSessionStatus.booting,
      startedAt: NOW,
      lastActivityAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'interactive_sessions')).toBe(true);
    repository = new SQLiteInteractiveSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create()', () => {
    it('persists a session record', async () => {
      const session = createTestSession();
      await repository.create(session);
      const row = db
        .prepare('SELECT * FROM interactive_sessions WHERE id = ?')
        .get('session-001') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.id).toBe('session-001');
      expect(row.feature_id).toBe('feature-abc');
      expect(row.status).toBe('booting');
      expect(row.stopped_at).toBeNull();
    });
  });

  describe('findById()', () => {
    it('returns null for nonexistent ID', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the session when found', async () => {
      const session = createTestSession();
      await repository.create(session);
      const found = await repository.findById('session-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('session-001');
      expect(found!.featureId).toBe('feature-abc');
      expect(found!.status).toBe(InteractiveSessionStatus.booting);
    });
  });

  describe('findByFeatureId()', () => {
    it('returns null when no session for the feature', async () => {
      const result = await repository.findByFeatureId('no-such-feature');
      expect(result).toBeNull();
    });

    it('returns the most recent session for a feature', async () => {
      await repository.create(createTestSession({ id: 'session-old', createdAt: NOW }));
      await repository.create(createTestSession({ id: 'session-new', createdAt: LATER }));
      const found = await repository.findByFeatureId('feature-abc');
      expect(found!.id).toBe('session-new');
    });
  });

  describe('findAllActive()', () => {
    it('returns empty array when no active sessions', async () => {
      const result = await repository.findAllActive();
      expect(result).toHaveLength(0);
    });

    it('returns only booting and ready sessions', async () => {
      await repository.create(
        createTestSession({ id: 's1', status: InteractiveSessionStatus.booting })
      );
      await repository.create(
        createTestSession({ id: 's2', status: InteractiveSessionStatus.ready })
      );
      await repository.create(
        createTestSession({ id: 's3', status: InteractiveSessionStatus.stopped })
      );
      await repository.create(
        createTestSession({ id: 's4', status: InteractiveSessionStatus.error })
      );
      const active = await repository.findAllActive();
      expect(active).toHaveLength(2);
      const ids = active.map((s) => s.id).sort();
      expect(ids).toEqual(['s1', 's2']);
    });
  });

  describe('updateStatus()', () => {
    it('updates status without stoppedAt', async () => {
      await repository.create(createTestSession());
      await repository.updateStatus('session-001', InteractiveSessionStatus.ready);
      const found = await repository.findById('session-001');
      expect(found!.status).toBe(InteractiveSessionStatus.ready);
      expect(found!.stoppedAt).toBeUndefined();
    });

    it('sets stoppedAt when provided', async () => {
      const stoppedAt = new Date('2026-03-22T10:20:00Z');
      await repository.create(createTestSession());
      await repository.updateStatus('session-001', InteractiveSessionStatus.stopped, stoppedAt);
      const found = await repository.findById('session-001');
      expect(found!.status).toBe(InteractiveSessionStatus.stopped);
      expect(found!.stoppedAt).toEqual(stoppedAt);
    });
  });

  describe('updateLastActivity()', () => {
    it('updates lastActivityAt timestamp', async () => {
      await repository.create(createTestSession());
      await repository.updateLastActivity('session-001', LATER);
      const found = await repository.findById('session-001');
      expect(found!.lastActivityAt).toEqual(LATER);
    });
  });

  describe('markAllActiveStopped()', () => {
    it('marks all booting and ready sessions as stopped', async () => {
      await repository.create(
        createTestSession({ id: 's1', status: InteractiveSessionStatus.booting })
      );
      await repository.create(
        createTestSession({ id: 's2', status: InteractiveSessionStatus.ready })
      );
      await repository.create(
        createTestSession({ id: 's3', status: InteractiveSessionStatus.stopped })
      );
      await repository.markAllActiveStopped();
      expect((await repository.findById('s1'))!.status).toBe(InteractiveSessionStatus.stopped);
      expect((await repository.findById('s2'))!.status).toBe(InteractiveSessionStatus.stopped);
      expect((await repository.findById('s3'))!.status).toBe(InteractiveSessionStatus.stopped);
    });
  });

  describe('markStoppedIfActive()', () => {
    it('stops a booting or ready row and reports the change', async () => {
      await repository.create(
        createTestSession({ id: 's1', status: InteractiveSessionStatus.ready })
      );
      const stoppedAt = new Date();

      expect(await repository.markStoppedIfActive('s1', stoppedAt)).toBe(true);

      const row = await repository.findById('s1');
      expect(row!.status).toBe(InteractiveSessionStatus.stopped);
      expect(row!.stoppedAt?.getTime()).toBe(stoppedAt.getTime());
    });

    it('leaves a row that is already stopped or errored untouched', async () => {
      await repository.create(
        createTestSession({ id: 's2', status: InteractiveSessionStatus.error })
      );

      expect(await repository.markStoppedIfActive('s2', new Date())).toBe(false);
      expect((await repository.findById('s2'))!.status).toBe(InteractiveSessionStatus.error);
      expect(await repository.markStoppedIfActive('missing', new Date())).toBe(false);
    });
  });

  describe('countActiveSessions()', () => {
    it('returns 0 when no active sessions', async () => {
      expect(await repository.countActiveSessions()).toBe(0);
    });

    it('counts booting and ready sessions', async () => {
      await repository.create(
        createTestSession({ id: 's1', status: InteractiveSessionStatus.booting })
      );
      await repository.create(
        createTestSession({ id: 's2', status: InteractiveSessionStatus.ready })
      );
      await repository.create(
        createTestSession({ id: 's3', status: InteractiveSessionStatus.stopped })
      );
      expect(await repository.countActiveSessions()).toBe(2);
    });
  });
});
