/**
 * Parallel-Capacity Query Integration Tests
 *
 * Covers the two queries admission control depends on, plus the queuedAt
 * round-trip. These assertions live at the REPOSITORY level, not the mapper
 * level, on purpose: a mapper test proves the row object was shaped correctly
 * and proves nothing about whether the INSERT/UPDATE column lists actually
 * carry the column to SQLite.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import { RUNNING_LIFECYCLES } from '@/domain/shared/parallel-feature-limit.js';

describe('SQLiteFeatureRepository — parallel-capacity queries', () => {
  let db: Database.Database;
  let repository: SQLiteFeatureRepository;

  const RUNNING = [...RUNNING_LIFECYCLES];

  const createTestFeature = (overrides?: Partial<Feature>): Feature => ({
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/home/user/project',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'features')).toBe(true);
    repository = new SQLiteFeatureRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('queuedAt persistence', () => {
    it('round-trips a queuedAt timestamp set at creation', async () => {
      const queuedAt = new Date('2026-02-01T10:00:00Z');
      await repository.create(createTestFeature({ lifecycle: SdlcLifecycle.Pending, queuedAt }));

      const loaded = await repository.findById('feat-1');
      expect(loaded?.queuedAt).toEqual(queuedAt);
    });

    it('persists a queuedAt set by a later update', async () => {
      await repository.create(createTestFeature({ lifecycle: SdlcLifecycle.Pending }));
      expect((await repository.findById('feat-1'))?.queuedAt).toBeUndefined();

      const feature = (await repository.findById('feat-1'))!;
      feature.queuedAt = new Date('2026-02-01T11:00:00Z');
      await repository.update(feature);

      expect((await repository.findById('feat-1'))?.queuedAt).toEqual(
        new Date('2026-02-01T11:00:00Z')
      );
    });

    it('clears queuedAt back to null on admission', async () => {
      await repository.create(
        createTestFeature({
          lifecycle: SdlcLifecycle.Pending,
          queuedAt: new Date('2026-02-01T10:00:00Z'),
        })
      );

      const feature = (await repository.findById('feat-1'))!;
      delete feature.queuedAt;
      feature.lifecycle = SdlcLifecycle.Requirements;
      await repository.update(feature);

      const admitted = await repository.findById('feat-1');
      expect(admitted?.queuedAt).toBeUndefined();
      expect(admitted?.lifecycle).toBe(SdlcLifecycle.Requirements);
    });
  });

  describe('countByLifecycles', () => {
    it('counts only features in the requested lifecycles', async () => {
      await repository.create(
        createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Implementation })
      );
      await repository.create(
        createTestFeature({ id: 'b', slug: 'b', lifecycle: SdlcLifecycle.Requirements })
      );
      await repository.create(
        createTestFeature({ id: 'c', slug: 'c', lifecycle: SdlcLifecycle.Review })
      );
      await repository.create(
        createTestFeature({ id: 'd', slug: 'd', lifecycle: SdlcLifecycle.Pending })
      );

      expect(await repository.countByLifecycles(RUNNING)).toBe(2);
    });

    it('excludes soft-deleted features', async () => {
      await repository.create(
        createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Implementation })
      );
      await repository.create(
        createTestFeature({ id: 'b', slug: 'b', lifecycle: SdlcLifecycle.Implementation })
      );
      await repository.softDelete('b');

      expect(await repository.countByLifecycles(RUNNING)).toBe(1);
    });

    it('returns 0 for an empty lifecycle list without touching the database', async () => {
      await repository.create(
        createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Implementation })
      );

      expect(await repository.countByLifecycles([])).toBe(0);
    });

    it('counts each running lifecycle value', async () => {
      for (const [index, lifecycle] of RUNNING.entries()) {
        await repository.create(
          createTestFeature({ id: `f-${index}`, slug: `f-${index}`, lifecycle })
        );
      }

      expect(await repository.countByLifecycles(RUNNING)).toBe(RUNNING.length);
    });
  });

  describe('listQueued', () => {
    it('returns only features carrying a queuedAt, in FIFO order', async () => {
      await repository.create(
        createTestFeature({
          id: 'second',
          slug: 'second',
          lifecycle: SdlcLifecycle.Pending,
          queuedAt: new Date('2026-02-01T12:00:00Z'),
        })
      );
      await repository.create(
        createTestFeature({
          id: 'first',
          slug: 'first',
          lifecycle: SdlcLifecycle.Pending,
          queuedAt: new Date('2026-02-01T10:00:00Z'),
        })
      );
      // User-deferred: same lifecycle, no queuedAt — must never be admitted.
      await repository.create(
        createTestFeature({ id: 'deferred', slug: 'deferred', lifecycle: SdlcLifecycle.Pending })
      );

      const queued = await repository.listQueued();

      expect(queued.map((f) => f.id)).toEqual(['first', 'second']);
    });

    it('excludes soft-deleted queued features', async () => {
      await repository.create(
        createTestFeature({
          id: 'gone',
          slug: 'gone',
          lifecycle: SdlcLifecycle.Pending,
          queuedAt: new Date('2026-02-01T10:00:00Z'),
        })
      );
      await repository.softDelete('gone');

      expect(await repository.listQueued()).toEqual([]);
    });

    it('returns an empty list when nothing is queued', async () => {
      await repository.create(
        createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Implementation })
      );

      expect(await repository.listQueued()).toEqual([]);
    });
  });
});
