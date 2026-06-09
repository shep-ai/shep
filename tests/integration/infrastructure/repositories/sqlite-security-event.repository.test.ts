/**
 * SQLite Security Event Repository Integration Tests
 *
 * Tests for the SQLite implementation of ISecurityEventRepository.
 * Uses a real in-memory database with migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '../../../../packages/core/src/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSecurityEventRepository } from '../../../../packages/core/src/infrastructure/repositories/sqlite-security-event.repository.js';
import {
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../../packages/core/src/domain/generated/output.js';
import type { SecurityEvent } from '../../../../packages/core/src/domain/generated/output.js';

function createTestEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: globalThis.crypto.randomUUID(),
    repositoryPath: '/repos/my-project',
    severity: SecuritySeverity.High,
    category: SecurityActionCategory.DependencyInstall,
    disposition: SecurityActionDisposition.Denied,
    createdAt: new Date(),
    updatedAt: new Date(),
    featureId: 'feat-123',
    actor: 'agent',
    message: 'Blocked dependency install',
    remediationSummary: 'Remove disallowed package',
    ...overrides,
  };
}

describe('SQLiteSecurityEventRepository', () => {
  let db: Database.Database;
  let repository: SQLiteSecurityEventRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'security_events')).toBe(true);
    repository = new SQLiteSecurityEventRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save()', () => {
    it('should insert a security event', async () => {
      const event = createTestEvent();
      await repository.save(event);

      const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get(event.id) as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.repository_path).toBe('/repos/my-project');
      expect(row.severity).toBe('High');
      expect(row.category).toBe('DependencyInstall');
      expect(row.disposition).toBe('Denied');
    });

    it('should handle optional fields as NULL', async () => {
      const event = createTestEvent({
        featureId: undefined,
        actor: undefined,
        message: undefined,
        remediationSummary: undefined,
      });
      await repository.save(event);

      const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get(event.id) as Record<
        string,
        unknown
      >;
      expect(row.feature_id).toBeNull();
      expect(row.actor).toBeNull();
      expect(row.message).toBeNull();
      expect(row.remediation_summary).toBeNull();
    });
  });

  describe('findByRepository()', () => {
    it('should return events for the given repository path', async () => {
      const event1 = createTestEvent({ repositoryPath: '/repos/project-a' });
      const event2 = createTestEvent({ repositoryPath: '/repos/project-a' });
      const event3 = createTestEvent({ repositoryPath: '/repos/project-b' });

      await repository.save(event1);
      await repository.save(event2);
      await repository.save(event3);

      const results = await repository.findByRepository('/repos/project-a');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.repositoryPath === '/repos/project-a')).toBe(true);
    });

    it('should order results by created_at DESC', async () => {
      const older = createTestEvent({
        repositoryPath: '/repos/test',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
      const newer = createTestEvent({
        repositoryPath: '/repos/test',
        createdAt: new Date('2025-06-01T00:00:00Z'),
      });

      await repository.save(older);
      await repository.save(newer);

      const results = await repository.findByRepository('/repos/test');
      expect(results[0].id).toBe(newer.id);
      expect(results[1].id).toBe(older.id);
    });

    it('should support limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(createTestEvent({ repositoryPath: '/repos/test' }));
      }

      const results = await repository.findByRepository('/repos/test', { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('should support severity filter', async () => {
      await repository.save(
        createTestEvent({
          repositoryPath: '/repos/test',
          severity: SecuritySeverity.Low,
        })
      );
      await repository.save(
        createTestEvent({
          repositoryPath: '/repos/test',
          severity: SecuritySeverity.Critical,
        })
      );

      const results = await repository.findByRepository('/repos/test', {
        severity: SecuritySeverity.Critical,
      });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe(SecuritySeverity.Critical);
    });

    it('should return empty array when no events match', async () => {
      const results = await repository.findByRepository('/repos/nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('findByFeature()', () => {
    it('should return events for the given feature ID', async () => {
      await repository.save(createTestEvent({ featureId: 'feat-1' }));
      await repository.save(createTestEvent({ featureId: 'feat-1' }));
      await repository.save(createTestEvent({ featureId: 'feat-2' }));

      const results = await repository.findByFeature('feat-1');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.featureId === 'feat-1')).toBe(true);
    });
  });

  describe('deleteOlderThan()', () => {
    it('should remove events older than the given date', async () => {
      const old = createTestEvent({
        repositoryPath: '/repos/test',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });
      const recent = createTestEvent({
        repositoryPath: '/repos/test',
        createdAt: new Date('2025-06-01T00:00:00Z'),
      });

      await repository.save(old);
      await repository.save(recent);

      const deleted = await repository.deleteOlderThan(new Date('2025-01-01T00:00:00Z'));
      expect(deleted).toBe(1);

      const remaining = await repository.findByRepository('/repos/test');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(recent.id);
    });

    it('should return 0 when no events are older than the date', async () => {
      await repository.save(
        createTestEvent({
          repositoryPath: '/repos/test',
          createdAt: new Date('2025-06-01T00:00:00Z'),
        })
      );

      const deleted = await repository.deleteOlderThan(new Date('2020-01-01T00:00:00Z'));
      expect(deleted).toBe(0);
    });
  });

  describe('count()', () => {
    it('should return the count of events for a repository', async () => {
      await repository.save(createTestEvent({ repositoryPath: '/repos/a' }));
      await repository.save(createTestEvent({ repositoryPath: '/repos/a' }));
      await repository.save(createTestEvent({ repositoryPath: '/repos/b' }));

      const countA = await repository.count('/repos/a');
      const countB = await repository.count('/repos/b');
      const countC = await repository.count('/repos/c');

      expect(countA).toBe(2);
      expect(countB).toBe(1);
      expect(countC).toBe(0);
    });
  });

  describe('SQL injection prevention', () => {
    it('should safely handle repository paths with special characters', async () => {
      const event = createTestEvent({
        repositoryPath: "Robert'; DROP TABLE security_events;--",
      });
      await repository.save(event);
      expect(tableExists(db, 'security_events')).toBe(true);

      const results = await repository.findByRepository("Robert'; DROP TABLE security_events;--");
      expect(results).toHaveLength(1);
    });
  });
});
