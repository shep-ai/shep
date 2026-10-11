/**
 * SQLiteInteractiveMessageRepository Integration Tests
 *
 * Tests for the SQLite implementation of IInteractiveMessageRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteInteractiveMessageRepository } from '@/infrastructure/repositories/sqlite-interactive-message.repository.js';
import { InteractiveMessageRole, type InteractiveMessage } from '@/domain/generated/output.js';

describe('SQLiteInteractiveMessageRepository', () => {
  let db: Database.Database;
  let repository: SQLiteInteractiveMessageRepository;

  const T1 = new Date('2026-03-22T10:00:00Z');
  const T2 = new Date('2026-03-22T10:01:00Z');
  const T3 = new Date('2026-03-22T10:02:00Z');

  function createTestMessage(overrides: Partial<InteractiveMessage> = {}): InteractiveMessage {
    return {
      id: 'msg-001',
      featureId: 'feature-abc',
      // sessionId omitted by default so FK constraints are not triggered in unrelated tests
      role: InteractiveMessageRole.user,
      content: 'Hello agent',
      createdAt: T1,
      updatedAt: T1,
      ...overrides,
    };
  }

  /** Insert a minimal session row to satisfy FK constraints when session_id is used. */
  function insertSession(sessionId: string, featureId = 'feature-abc'): void {
    db.prepare(
      `INSERT INTO interactive_sessions (id, feature_id, status, started_at, last_activity_at, created_at, updated_at)
       VALUES (?, ?, 'ready', ?, ?, ?, ?)`
    ).run(sessionId, featureId, T1.getTime(), T1.getTime(), T1.getTime(), T1.getTime());
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'interactive_messages')).toBe(true);
    repository = new SQLiteInteractiveMessageRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create()', () => {
    it('persists a message record with null session_id', async () => {
      const message = createTestMessage();
      await repository.create(message);
      const row = db
        .prepare('SELECT * FROM interactive_messages WHERE id = ?')
        .get('msg-001') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.id).toBe('msg-001');
      expect(row.feature_id).toBe('feature-abc');
      expect(row.session_id).toBeNull();
      expect(row.role).toBe('user');
      expect(row.content).toBe('Hello agent');
    });

    it('persists a message record with a valid session_id', async () => {
      insertSession('session-001');
      const message = createTestMessage({ sessionId: 'session-001' });
      await repository.create(message);
      const row = db
        .prepare('SELECT session_id FROM interactive_messages WHERE id = ?')
        .get('msg-001') as Record<string, unknown>;
      expect(row.session_id).toBe('session-001');
    });

    it('stores null session_id when sessionId is not provided', async () => {
      await repository.create(createTestMessage({ id: 'msg-no-session', sessionId: undefined }));
      const row = db
        .prepare('SELECT session_id FROM interactive_messages WHERE id = ?')
        .get('msg-no-session') as Record<string, unknown>;
      expect(row.session_id).toBeNull();
    });
  });

  describe('findByFeatureId()', () => {
    it('returns empty array when no messages', async () => {
      const result = await repository.findByFeatureId('no-such-feature');
      expect(result).toHaveLength(0);
    });

    it('returns messages ordered by created_at ASC', async () => {
      await repository.create(createTestMessage({ id: 'msg-3', createdAt: T3 }));
      await repository.create(createTestMessage({ id: 'msg-1', createdAt: T1 }));
      await repository.create(createTestMessage({ id: 'msg-2', createdAt: T2 }));
      const messages = await repository.findByFeatureId('feature-abc');
      expect(messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('scopes messages by featureId', async () => {
      await repository.create(createTestMessage({ id: 'msg-a', featureId: 'feature-abc' }));
      await repository.create(createTestMessage({ id: 'msg-b', featureId: 'feature-xyz' }));
      const result = await repository.findByFeatureId('feature-abc');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg-a');
    });

    it('respects the limit parameter', async () => {
      for (let i = 1; i <= 5; i++) {
        await repository.create(
          createTestMessage({
            id: `msg-${i}`,
            createdAt: new Date(T1.getTime() + i * 1000),
          })
        );
      }
      const result = await repository.findByFeatureId('feature-abc', 3);
      expect(result).toHaveLength(3);
    });

    it('returns messages across session boundaries for the same feature', async () => {
      insertSession('session-001');
      insertSession('session-002');
      await repository.create(createTestMessage({ id: 'msg-s1', sessionId: 'session-001' }));
      await repository.create(
        createTestMessage({ id: 'msg-s2', sessionId: 'session-002', createdAt: T2 })
      );
      const result = await repository.findByFeatureId('feature-abc');
      expect(result).toHaveLength(2);
    });
  });

  describe('findBySessionId()', () => {
    it('returns empty array when no messages for session', async () => {
      const result = await repository.findBySessionId('nonexistent-session');
      expect(result).toHaveLength(0);
    });

    it('returns messages ordered by created_at ASC for the session', async () => {
      insertSession('sess-A');
      insertSession('sess-B');
      await repository.create(
        createTestMessage({ id: 'msg-1', sessionId: 'sess-A', createdAt: T1 })
      );
      await repository.create(
        createTestMessage({ id: 'msg-2', sessionId: 'sess-A', createdAt: T2 })
      );
      await repository.create(
        createTestMessage({ id: 'msg-other', sessionId: 'sess-B', createdAt: T1 })
      );
      const result = await repository.findBySessionId('sess-A');
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    });
  });
  describe('findByFeatureIdSince() (spec 137)', () => {
    it('returns only newer rows of that scope, oldest first', async () => {
      await repository.create(createTestMessage({ id: 'old', createdAt: T1, updatedAt: T1 }));
      await repository.create(createTestMessage({ id: 'newer', createdAt: T3, updatedAt: T3 }));
      await repository.create(createTestMessage({ id: 'new', createdAt: T2, updatedAt: T2 }));
      await repository.create(
        createTestMessage({ id: 'other-scope', featureId: 'repo-r1', createdAt: T3, updatedAt: T3 })
      );

      const rows = await repository.findByFeatureIdSince('feature-abc', T1);

      expect(rows.map((m) => m.id)).toEqual(['new', 'newer']);
    });

    it('returns nothing when no row is newer', async () => {
      await repository.create(createTestMessage({ id: 'only', createdAt: T2, updatedAt: T2 }));
      expect(await repository.findByFeatureIdSince('feature-abc', T2)).toEqual([]);
    });
  });
});
