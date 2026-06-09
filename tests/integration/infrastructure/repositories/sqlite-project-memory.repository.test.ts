/**
 * SQLiteProjectMemoryRepository Integration Tests (102-shep-brain).
 *
 * Uses an in-memory SQLite database with full migrations applied.
 * Exercises create/findById, listByRepository ordering, and upsert
 * idempotency (no duplicate rows on the same key), including non-default
 * field values per LESSONS.md (the write path must persist every column).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteProjectMemoryRepository } from '@/infrastructure/repositories/sqlite-project-memory.repository.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';

describe('SQLiteProjectMemoryRepository', () => {
  let db: Database.Database;
  let repo: SQLiteProjectMemoryRepository;

  const NOW = new Date('2026-05-01T10:00:00Z');

  function makeMemory(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
    return {
      id: 'mem-001',
      repositoryPath: '/home/user/shep',
      category: MemoryCategory.Convention,
      entryKey: 'use-cases-only-entry-point',
      content: 'Presentation layers must call core logic through use-case classes.',
      sourceFeatureId: 'feat-102-shep-brain',
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'project_memory')).toBe(true);
    repo = new SQLiteProjectMemoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('roundtrips all fields including non-default values', async () => {
      await repo.create(makeMemory());

      const found = await repo.findById('mem-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('mem-001');
      expect(found!.repositoryPath).toBe('/home/user/shep');
      expect(found!.category).toBe(MemoryCategory.Convention);
      expect(found!.entryKey).toBe('use-cases-only-entry-point');
      expect(found!.content).toBe(
        'Presentation layers must call core logic through use-case classes.'
      );
      expect(found!.sourceFeatureId).toBe('feat-102-shep-brain');
      expect(found!.createdAt).toEqual(NOW);
      expect(found!.updatedAt).toEqual(NOW);
    });

    it('roundtrips an entry with no optional fields', async () => {
      await repo.create(makeMemory({ id: 'mem-002', sourceFeatureId: undefined }));

      const found = await repo.findById('mem-002');
      expect(found).not.toBeNull();
      expect(found!.sourceFeatureId).toBeUndefined();
    });

    it('returns null for a nonexistent id', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });

    it('preserves every MemoryCategory value through a roundtrip', async () => {
      const categories = [
        MemoryCategory.Convention,
        MemoryCategory.Library,
        MemoryCategory.NamingPattern,
        MemoryCategory.ArchitectureDecision,
        MemoryCategory.CiFixResolution,
      ];
      for (const [i, category] of categories.entries()) {
        await repo.create(makeMemory({ id: `cat-${i}`, entryKey: `key-${i}`, category }));
        const found = await repo.findById(`cat-${i}`);
        expect(found!.category).toBe(category);
      }
    });
  });

  describe('listByRepository()', () => {
    it('returns only entries for the given repository', async () => {
      await repo.create(makeMemory({ id: 'a', entryKey: 'k-a' }));
      await repo.create(makeMemory({ id: 'b', entryKey: 'k-b' }));
      await repo.create(
        makeMemory({ id: 'other', entryKey: 'k-a', repositoryPath: '/other/repo' })
      );

      const results = await repo.listByRepository('/home/user/shep');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(['a', 'b']);
    });

    it('orders by category then most-recently-updated first', async () => {
      await repo.create(
        makeMemory({
          id: 'lib-old',
          category: MemoryCategory.Library,
          entryKey: 'lib-1',
          updatedAt: new Date('2026-05-01T10:00:00Z'),
        })
      );
      await repo.create(
        makeMemory({
          id: 'conv',
          category: MemoryCategory.Convention,
          entryKey: 'conv-1',
          updatedAt: new Date('2026-05-02T10:00:00Z'),
        })
      );
      await repo.create(
        makeMemory({
          id: 'lib-new',
          category: MemoryCategory.Library,
          entryKey: 'lib-2',
          updatedAt: new Date('2026-05-03T10:00:00Z'),
        })
      );

      const results = await repo.listByRepository('/home/user/shep');
      // Convention sorts before Library; within Library, newest first.
      expect(results.map((r) => r.id)).toEqual(['conv', 'lib-new', 'lib-old']);
    });

    it('returns empty array when no entries exist for the repository', async () => {
      expect(await repo.listByRepository('/nope')).toHaveLength(0);
    });
  });

  describe('upsert()', () => {
    it('inserts a new row when the key does not exist', async () => {
      await repo.upsert({
        id: 'up-1',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Library,
        entryKey: 'preferred-db',
        content: 'Use better-sqlite3 for persistence.',
        sourceFeatureId: 'feat-1',
      });

      const found = await repo.findById('up-1');
      expect(found).not.toBeNull();
      expect(found!.content).toBe('Use better-sqlite3 for persistence.');
    });

    it('updates content in place when (repo, category, key) already exists (idempotent)', async () => {
      await repo.upsert({
        id: 'up-1',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Library,
        entryKey: 'preferred-db',
        content: 'Original.',
      });
      await repo.upsert({
        id: 'up-2-different-id',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Library,
        entryKey: 'preferred-db',
        content: 'Updated: use better-sqlite3, not knex.',
        sourceFeatureId: 'feat-2',
      });

      const all = await repo.listByRepository('/home/user/shep');
      expect(all).toHaveLength(1);
      // The original id is preserved; content is updated.
      const found = await repo.findById('up-1');
      expect(found).not.toBeNull();
      expect(found!.content).toBe('Updated: use better-sqlite3, not knex.');
      expect(found!.sourceFeatureId).toBe('feat-2');
    });

    it('treats the same key under different categories as distinct rows', async () => {
      await repo.upsert({
        id: 'x',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Convention,
        entryKey: 'shared-key',
        content: 'A convention.',
      });
      await repo.upsert({
        id: 'y',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Library,
        entryKey: 'shared-key',
        content: 'A library choice.',
      });

      expect(await repo.listByRepository('/home/user/shep')).toHaveLength(2);
    });

    it('treats the same key under different repositories as distinct rows', async () => {
      await repo.upsert({
        id: 'x',
        repositoryPath: '/repo-a',
        category: MemoryCategory.Convention,
        entryKey: 'shared-key',
        content: 'A.',
      });
      await repo.upsert({
        id: 'y',
        repositoryPath: '/repo-b',
        category: MemoryCategory.Convention,
        entryKey: 'shared-key',
        content: 'B.',
      });

      expect(await repo.listByRepository('/repo-a')).toHaveLength(1);
      expect(await repo.listByRepository('/repo-b')).toHaveLength(1);
    });
  });

  describe('date handling', () => {
    it('stores and retrieves dates with millisecond precision', async () => {
      const precise = new Date('2026-05-15T12:34:56.789Z');
      await repo.create(makeMemory({ createdAt: precise, updatedAt: precise }));

      const found = await repo.findById('mem-001');
      expect(found!.createdAt.getTime()).toBe(precise.getTime());
      expect(found!.updatedAt.getTime()).toBe(precise.getTime());
    });
  });
});
