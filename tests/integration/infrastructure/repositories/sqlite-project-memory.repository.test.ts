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
import { MemoryCategory, MemoryScope } from '@/domain/generated/output.js';

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

  describe('listAll()', () => {
    it('returns entries across all repositories, ordered by repo then category', async () => {
      await repo.create(
        makeMemory({ id: 'b', repositoryPath: '/repo-b', category: MemoryCategory.Library })
      );
      await repo.create(
        makeMemory({ id: 'a2', repositoryPath: '/repo-a', category: MemoryCategory.Library })
      );
      await repo.create(
        makeMemory({ id: 'a1', repositoryPath: '/repo-a', category: MemoryCategory.Convention })
      );

      const all = await repo.listAll();
      expect(all.map((r) => r.id)).toEqual(['a1', 'a2', 'b']);
    });

    it('returns an empty array when the store is empty', async () => {
      expect(await repo.listAll()).toHaveLength(0);
    });
  });

  describe('scope', () => {
    it('defaults to Project when not set and round-trips Organization', async () => {
      await repo.create(makeMemory({ id: 'proj' }));
      await repo.create(
        makeMemory({ id: 'org', entryKey: 'org-key', scope: MemoryScope.Organization })
      );

      expect((await repo.findById('proj'))!.scope).toBe(MemoryScope.Project);
      expect((await repo.findById('org'))!.scope).toBe(MemoryScope.Organization);
    });

    it('round-trips space and product line ids through create', async () => {
      await repo.create(makeMemory({ id: 'm', spaceId: 'space-a', productLineId: 'line-a' }));
      const found = await repo.findById('m');
      expect(found!.spaceId).toBe('space-a');
      expect(found!.productLineId).toBe('line-a');
    });

    it('listSpaceWide returns Space and legacy Organization entries of one space only', async () => {
      await repo.create(makeMemory({ id: 'p', entryKey: 'p', spaceId: 'space-a' }));
      await repo.create(
        makeMemory({ id: 's-a', entryKey: 's-a', scope: MemoryScope.Space, spaceId: 'space-a' })
      );
      await repo.create(
        makeMemory({
          id: 'o-a',
          entryKey: 'o-a',
          scope: MemoryScope.Organization,
          spaceId: 'space-a',
          repositoryPath: '/repo-b',
        })
      );
      await repo.create(
        makeMemory({ id: 's-b', entryKey: 's-b', scope: MemoryScope.Space, spaceId: 'space-b' })
      );
      await repo.create(
        makeMemory({
          id: 'o-b',
          entryKey: 'o-b',
          scope: MemoryScope.Organization,
          spaceId: 'space-b',
        })
      );

      const entries = await repo.listSpaceWide('space-a');
      expect(entries.map((e) => e.id).sort()).toEqual(['o-a', 's-a']);
    });

    it('listProductLine returns only ProductLine entries of that line', async () => {
      await repo.create(
        makeMemory({
          id: 'l-a',
          entryKey: 'l-a',
          scope: MemoryScope.ProductLine,
          spaceId: 'space-a',
          productLineId: 'line-a',
        })
      );
      await repo.create(
        makeMemory({
          id: 'l-b',
          entryKey: 'l-b',
          scope: MemoryScope.ProductLine,
          spaceId: 'space-a',
          productLineId: 'line-b',
        })
      );
      await repo.create(
        makeMemory({ id: 'p-a', entryKey: 'p-a', spaceId: 'space-a', productLineId: 'line-a' })
      );

      expect((await repo.listProductLine('line-a')).map((e) => e.id)).toEqual(['l-a']);
    });

    it('updateScope writes the scope and the placement it was promoted in', async () => {
      await repo.create(makeMemory({ updatedAt: NOW, spaceId: 'space-a' }));

      await repo.updateScope('mem-001', MemoryScope.ProductLine, {
        spaceId: 'space-a',
        productLineId: 'line-a',
      });
      let found = await repo.findById('mem-001');
      expect(found!.scope).toBe(MemoryScope.ProductLine);
      expect(found!.productLineId).toBe('line-a');

      await repo.updateScope('mem-001', MemoryScope.Project, { spaceId: 'space-b' });
      found = await repo.findById('mem-001');
      expect(found!.scope).toBe(MemoryScope.Project);
      expect(found!.spaceId).toBe('space-b');
      expect(found!.productLineId).toBeUndefined();
    });

    it('keeps a promoted scope when the same key is recorded again', async () => {
      await repo.upsert({
        id: 'first',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Convention,
        entryKey: 'k',
        content: 'v1',
        spaceId: 'space-a',
      });
      await repo.updateScope('first', MemoryScope.Space, { spaceId: 'space-a' });

      await repo.upsert({
        id: 'second',
        repositoryPath: '/home/user/shep',
        category: MemoryCategory.Convention,
        entryKey: 'k',
        content: 'v2',
        spaceId: 'space-a',
      });

      const found = await repo.findById('first');
      expect(found!.content).toBe('v2');
      expect(found!.scope).toBe(MemoryScope.Space);
      expect(found!.spaceId).toBe('space-a');
    });

    it('stamps the space on an upserted insert', async () => {
      await repo.upsert({
        id: 'new',
        repositoryPath: '/r',
        category: MemoryCategory.Library,
        entryKey: 'k',
        content: 'c',
        spaceId: 'space-z',
        productLineId: 'line-z',
      });
      const found = await repo.findById('new');
      expect(found!.scope).toBe(MemoryScope.Project);
      expect(found!.spaceId).toBe('space-z');
      expect(found!.productLineId).toBe('line-z');
    });

    it('listAll filters by space when given one, and counts per space', async () => {
      await repo.create(makeMemory({ id: 'a', entryKey: 'a', spaceId: 'space-a' }));
      await repo.create(makeMemory({ id: 'b', entryKey: 'b', spaceId: 'space-b' }));

      expect((await repo.listAll('space-a')).map((e) => e.id)).toEqual(['a']);
      expect((await repo.listAll()).length).toBe(2);
      expect(await repo.countBySpace('space-b')).toBe(1);
      expect(await repo.countBySpace('space-c')).toBe(0);
    });
  });

  describe('updateContent()', () => {
    it('updates content in place and bumps updated_at', async () => {
      await repo.create(makeMemory({ updatedAt: NOW }));

      await repo.updateContent('mem-001', 'Rewritten guidance.');

      const found = await repo.findById('mem-001');
      expect(found!.content).toBe('Rewritten guidance.');
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });
  });

  describe('delete()', () => {
    it('removes the entry by id', async () => {
      await repo.create(makeMemory());
      await repo.delete('mem-001');
      expect(await repo.findById('mem-001')).toBeNull();
    });

    it('is a no-op for a nonexistent id', async () => {
      await expect(repo.delete('nope')).resolves.toBeUndefined();
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
