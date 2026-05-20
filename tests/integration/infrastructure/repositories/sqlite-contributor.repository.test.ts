/**
 * SQLiteContributorRepository Integration Tests (spec 097, FR-21).
 *
 * Tests for the SQLite implementation of IContributorRepository. Uses an
 * in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteContributorRepository } from '@/infrastructure/repositories/sqlite-contributor.repository.js';
import type { Contributor } from '@/domain/generated/output.js';
import { ContributorLane, ContributorLevel } from '@/domain/generated/output.js';

describe('SQLiteContributorRepository', () => {
  let db: Database.Database;
  let repo: SQLiteContributorRepository;

  const NOW = new Date('2026-04-15T10:00:00Z');
  const LATER = new Date('2026-04-16T10:00:00Z');

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

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'contributors')).toBe(true);
    repo = new SQLiteContributorRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a contributor by id', async () => {
      await repo.create(createTestContributor());

      const found = await repo.findById('c-001');
      expect(found).not.toBeNull();
      expect(found!.githubLogin).toBe('octocat');
      expect(found!.level).toBe(ContributorLevel.Contributor);
      expect(found!.prCount).toBe(1);
      expect(found!.firstContributionAt).toEqual(NOW);
    });

    it('returns null for nonexistent id', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists all optional fields correctly', async () => {
      await repo.create(
        createTestContributor({
          displayName: 'The Octocat',
          avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
          lane: ContributorLane.Docs,
          issueCount: 3,
        })
      );

      const found = await repo.findById('c-001');
      expect(found!.displayName).toBe('The Octocat');
      expect(found!.avatarUrl).toBe('https://avatars.githubusercontent.com/u/583231?v=4');
      expect(found!.lane).toBe(ContributorLane.Docs);
      expect(found!.issueCount).toBe(3);
    });

    it('persists with no optional fields', async () => {
      await repo.create(createTestContributor());

      const found = await repo.findById('c-001');
      expect(found!.displayName).toBeUndefined();
      expect(found!.avatarUrl).toBeUndefined();
      expect(found!.lane).toBeUndefined();
    });
  });

  describe('findByGitHubLogin()', () => {
    it('returns the matching contributor', async () => {
      await repo.create(createTestContributor());

      const found = await repo.findByGitHubLogin('octocat');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('c-001');
    });

    it('returns null when login is not found', async () => {
      const found = await repo.findByGitHubLogin('nobody');
      expect(found).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates mutable fields and pr_count', async () => {
      await repo.create(createTestContributor());

      await repo.update(
        createTestContributor({
          level: ContributorLevel.Core,
          prCount: 12,
          issueCount: 4,
          lastContributionAt: LATER,
          updatedAt: LATER,
        })
      );

      const found = await repo.findById('c-001');
      expect(found!.level).toBe(ContributorLevel.Core);
      expect(found!.prCount).toBe(12);
      expect(found!.issueCount).toBe(4);
      expect(found!.lastContributionAt).toEqual(LATER);
      expect(found!.updatedAt).toEqual(LATER);
    });

    it('promotes lane assignment from undefined to a value', async () => {
      await repo.create(createTestContributor());

      await repo.update(
        createTestContributor({
          lane: ContributorLane.Agents,
        })
      );

      const found = await repo.findById('c-001');
      expect(found!.lane).toBe(ContributorLane.Agents);
    });
  });

  describe('delete()', () => {
    it('removes a contributor by id', async () => {
      await repo.create(createTestContributor());
      await repo.delete('c-001');

      expect(await repo.findById('c-001')).toBeNull();
    });
  });

  describe('listAll()', () => {
    it('returns contributors ordered by github_login ASC', async () => {
      await repo.create(createTestContributor({ id: 'c-1', githubLogin: 'zelda' }));
      await repo.create(createTestContributor({ id: 'c-2', githubLogin: 'alice' }));
      await repo.create(createTestContributor({ id: 'c-3', githubLogin: 'mario' }));

      const results = await repo.listAll();
      expect(results.map((c) => c.githubLogin)).toEqual(['alice', 'mario', 'zelda']);
    });
  });

  describe('findTopByPrCount()', () => {
    it('returns top all-time contributors ordered by prCount DESC', async () => {
      await repo.create(createTestContributor({ id: 'c-1', githubLogin: 'alice', prCount: 5 }));
      await repo.create(createTestContributor({ id: 'c-2', githubLogin: 'bob', prCount: 12 }));
      await repo.create(createTestContributor({ id: 'c-3', githubLogin: 'carol', prCount: 8 }));

      const results = await repo.findTopByPrCount({ scope: 'allTime', limit: 10 });
      expect(results.map((c) => c.githubLogin)).toEqual(['bob', 'carol', 'alice']);
    });

    it('respects the limit parameter', async () => {
      await repo.create(createTestContributor({ id: 'c-1', githubLogin: 'alice', prCount: 5 }));
      await repo.create(createTestContributor({ id: 'c-2', githubLogin: 'bob', prCount: 12 }));
      await repo.create(createTestContributor({ id: 'c-3', githubLogin: 'carol', prCount: 8 }));

      const results = await repo.findTopByPrCount({ scope: 'allTime', limit: 2 });
      expect(results).toHaveLength(2);
      expect(results.map((c) => c.githubLogin)).toEqual(['bob', 'carol']);
    });

    it('returns empty array on limit <= 0', async () => {
      await repo.create(createTestContributor());
      const results = await repo.findTopByPrCount({ scope: 'allTime', limit: 0 });
      expect(results).toEqual([]);
    });

    it('month scope filters to the current UTC calendar month', async () => {
      const now = new Date();
      const inMonth = now;
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

      await repo.create(
        createTestContributor({
          id: 'c-1',
          githubLogin: 'recent',
          prCount: 3,
          lastContributionAt: inMonth,
        })
      );
      await repo.create(
        createTestContributor({
          id: 'c-2',
          githubLogin: 'old',
          prCount: 99,
          lastContributionAt: lastMonth,
        })
      );

      const results = await repo.findTopByPrCount({ scope: 'month', limit: 10 });
      expect(results.map((c) => c.githubLogin)).toEqual(['recent']);
    });
  });
});
