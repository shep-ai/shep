/**
 * SQLiteRecognitionEventRepository Integration Tests (spec 097, FR-22 / NFR-11).
 *
 * Tests for the SQLite implementation of IRecognitionEventRepository.
 * Verifies idempotency under duplicate (contributor_id, kind, pr_number)
 * inserts, and the month-bucket query.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteContributorRepository } from '@/infrastructure/repositories/sqlite-contributor.repository.js';
import { SQLiteRecognitionEventRepository } from '@/infrastructure/repositories/sqlite-recognition-event.repository.js';
import type { Contributor, RecognitionEvent } from '@/domain/generated/output.js';
import { ContributorLevel, RecognitionKind } from '@/domain/generated/output.js';

describe('SQLiteRecognitionEventRepository', () => {
  let db: Database.Database;
  let contributorsRepo: SQLiteContributorRepository;
  let repo: SQLiteRecognitionEventRepository;

  const NOW = new Date('2026-04-15T10:00:00Z');

  function createTestContributor(overrides: Partial<Contributor> = {}): Contributor {
    return {
      id: 'c-001',
      githubLogin: 'octocat',
      level: ContributorLevel.Contributor,
      firstContributionAt: NOW,
      lastContributionAt: NOW,
      prCount: 1,
      issueCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function createTestEvent(overrides: Partial<RecognitionEvent> = {}): RecognitionEvent {
    return {
      id: 'r-001',
      contributorId: 'c-001',
      kind: RecognitionKind.FirstPR,
      occurredAt: NOW,
      prNumber: 42,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'recognition_events')).toBe(true);
    contributorsRepo = new SQLiteContributorRepository(db);
    repo = new SQLiteRecognitionEventRepository(db);
    await contributorsRepo.create(createTestContributor());
  });

  afterEach(() => {
    db.close();
  });

  describe('insert()', () => {
    it('inserts a new recognition event and reports inserted=true', async () => {
      const result = await repo.insert(createTestEvent());
      expect(result.inserted).toBe(true);

      const events = await repo.findByContributorId('c-001');
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe(RecognitionKind.FirstPR);
      expect(events[0].prNumber).toBe(42);
    });

    it('is idempotent on duplicate (contributorId, kind, prNumber) — second call returns inserted=false', async () => {
      const first = await repo.insert(createTestEvent({ id: 'r-001' }));
      const second = await repo.insert(createTestEvent({ id: 'r-002' }));

      expect(first.inserted).toBe(true);
      expect(second.inserted).toBe(false);

      const events = await repo.findByContributorId('c-001');
      expect(events).toHaveLength(1);
    });

    it('treats different kinds as distinct events for the same PR', async () => {
      await repo.insert(createTestEvent({ id: 'r-1', kind: RecognitionKind.FirstPR }));
      const second = await repo.insert(createTestEvent({ id: 'r-2', kind: RecognitionKind.NthPR }));

      expect(second.inserted).toBe(true);
      const events = await repo.findByContributorId('c-001');
      expect(events).toHaveLength(2);
    });

    it('persists optional monthRecapId', async () => {
      await repo.insert(
        createTestEvent({
          kind: RecognitionKind.MonthlyShoutout,
          prNumber: 0,
          monthRecapId: '2026-04',
        })
      );

      const events = await repo.findByContributorId('c-001');
      expect(events).toHaveLength(1);
      expect(events[0].monthRecapId).toBe('2026-04');
    });
  });

  describe('findByContributorId()', () => {
    it('orders by occurred_at DESC', async () => {
      const t1 = new Date('2026-04-15T10:00:00Z');
      const t2 = new Date('2026-04-16T10:00:00Z');
      const t3 = new Date('2026-04-17T10:00:00Z');

      await repo.insert(createTestEvent({ id: 'r-1', occurredAt: t1, prNumber: 10 }));
      await repo.insert(createTestEvent({ id: 'r-2', occurredAt: t3, prNumber: 12 }));
      await repo.insert(createTestEvent({ id: 'r-3', occurredAt: t2, prNumber: 11 }));

      const events = await repo.findByContributorId('c-001');
      expect(events.map((e) => e.prNumber)).toEqual([12, 11, 10]);
    });

    it('returns empty array when contributor has no events', async () => {
      const events = await repo.findByContributorId('nobody');
      expect(events).toEqual([]);
    });
  });

  describe('findByMonth()', () => {
    it('returns events whose occurred_at falls within the year-month bucket (UTC)', async () => {
      await repo.insert(
        createTestEvent({
          id: 'r-1',
          occurredAt: new Date('2026-04-01T00:00:00Z'),
          prNumber: 1,
        })
      );
      await repo.insert(
        createTestEvent({
          id: 'r-2',
          occurredAt: new Date('2026-04-30T23:59:59Z'),
          prNumber: 2,
        })
      );
      await repo.insert(
        createTestEvent({
          id: 'r-3',
          occurredAt: new Date('2026-05-01T00:00:00Z'),
          prNumber: 3,
        })
      );
      await repo.insert(
        createTestEvent({
          id: 'r-4',
          occurredAt: new Date('2026-03-31T23:59:59Z'),
          prNumber: 4,
        })
      );

      const events = await repo.findByMonth('2026-04');
      expect(events.map((e) => e.prNumber).sort()).toEqual([1, 2]);
    });

    it('returns empty array for an empty month', async () => {
      const events = await repo.findByMonth('2026-12');
      expect(events).toEqual([]);
    });

    it('throws on a malformed yearMonth bucket', async () => {
      await expect(repo.findByMonth('not-a-month')).rejects.toThrow(/Invalid yearMonth/);
    });
  });
});
