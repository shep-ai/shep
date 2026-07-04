/**
 * SQLiteDevServerRunPlanRepository Integration Tests (103-agentic-dev-server).
 *
 * Uses an in-memory SQLite database with full migrations applied.
 * Exercises upsert (insert + update paths), findByRepoPath, stampInstallHash,
 * and deleteByRepoPath with NON-DEFAULT values for every field per LESSONS.md
 * (the write path must persist every column — both RunPlanSource values,
 * null and non-null optionals).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteDevServerRunPlanRepository } from '@/infrastructure/repositories/sqlite-dev-server-run-plan.repository.js';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import { RunPlanSource } from '@/domain/generated/output.js';

describe('SQLiteDevServerRunPlanRepository', () => {
  let db: Database.Database;
  let repo: SQLiteDevServerRunPlanRepository;

  const CREATED = new Date('2026-07-01T08:15:30.123Z');
  const UPDATED = new Date('2026-07-04T09:45:00.456Z');

  function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
    return {
      repoPath: '/home/user/mono',
      source: RunPlanSource.Agent,
      command: 'pnpm dev',
      cwd: '/home/user/mono/apps/web',
      packageManager: 'pnpm',
      expectedPort: 4321,
      language: 'TypeScript',
      framework: 'Next.js',
      setupCommands: ['corepack enable pnpm', 'pnpm exec playwright install'],
      configHash: 'cfg-hash-v1',
      installStampHash: 'install-stamp-v1',
      createdAt: CREATED,
      updatedAt: CREATED,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'dev_server_run_plans')).toBe(true);
    repo = new SQLiteDevServerRunPlanRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert() insert path + findByRepoPath()', () => {
    it('roundtrips every field with non-default values (Agent source, all optionals set)', async () => {
      await repo.upsert(makePlan());

      const found = await repo.findByRepoPath('/home/user/mono');
      expect(found).not.toBeNull();
      expect(found!.repoPath).toBe('/home/user/mono');
      expect(found!.source).toBe(RunPlanSource.Agent);
      expect(found!.command).toBe('pnpm dev');
      expect(found!.cwd).toBe('/home/user/mono/apps/web');
      expect(found!.packageManager).toBe('pnpm');
      expect(found!.expectedPort).toBe(4321);
      expect(found!.language).toBe('TypeScript');
      expect(found!.framework).toBe('Next.js');
      expect(found!.setupCommands).toEqual([
        'corepack enable pnpm',
        'pnpm exec playwright install',
      ]);
      expect(found!.configHash).toBe('cfg-hash-v1');
      expect(found!.installStampHash).toBe('install-stamp-v1');
      expect(found!.createdAt).toEqual(CREATED);
      expect(found!.updatedAt).toEqual(CREATED);
    });

    it('roundtrips a Deterministic plan with all optionals absent and empty setupCommands', async () => {
      await repo.upsert(
        makePlan({
          repoPath: '/home/user/simple',
          source: RunPlanSource.Deterministic,
          command: 'npm run dev',
          cwd: '/home/user/simple',
          packageManager: undefined,
          expectedPort: undefined,
          language: undefined,
          framework: undefined,
          setupCommands: [],
          installStampHash: undefined,
        })
      );

      const found = await repo.findByRepoPath('/home/user/simple');
      expect(found).not.toBeNull();
      expect(found!.source).toBe(RunPlanSource.Deterministic);
      expect(found!.packageManager).toBeUndefined();
      expect(found!.expectedPort).toBeUndefined();
      expect(found!.language).toBeUndefined();
      expect(found!.framework).toBeUndefined();
      expect(found!.installStampHash).toBeUndefined();
      expect(found!.setupCommands).toEqual([]);
    });

    it('returns null for an unknown repo path', async () => {
      expect(await repo.findByRepoPath('/nope')).toBeNull();
    });
  });

  describe('upsert() update path', () => {
    it('updates EVERY column in place on conflict without duplicating rows', async () => {
      await repo.upsert(makePlan());

      await repo.upsert(
        makePlan({
          source: RunPlanSource.Deterministic,
          command: 'yarn start',
          cwd: '/home/user/mono',
          packageManager: 'yarn',
          expectedPort: 8080,
          language: 'JavaScript',
          framework: 'Vite',
          setupCommands: ['yarn dlx something'],
          configHash: 'cfg-hash-v2',
          installStampHash: 'install-stamp-v2',
          updatedAt: UPDATED,
        })
      );

      const count = db.prepare('SELECT COUNT(*) AS c FROM dev_server_run_plans').get() as {
        c: number;
      };
      expect(count.c).toBe(1);

      const found = await repo.findByRepoPath('/home/user/mono');
      expect(found!.source).toBe(RunPlanSource.Deterministic);
      expect(found!.command).toBe('yarn start');
      expect(found!.cwd).toBe('/home/user/mono');
      expect(found!.packageManager).toBe('yarn');
      expect(found!.expectedPort).toBe(8080);
      expect(found!.language).toBe('JavaScript');
      expect(found!.framework).toBe('Vite');
      expect(found!.setupCommands).toEqual(['yarn dlx something']);
      expect(found!.configHash).toBe('cfg-hash-v2');
      expect(found!.installStampHash).toBe('install-stamp-v2');
      expect(found!.updatedAt).toEqual(UPDATED);
    });

    it('can clear optional fields back to undefined on update', async () => {
      await repo.upsert(makePlan());
      await repo.upsert(
        makePlan({
          packageManager: undefined,
          expectedPort: undefined,
          language: undefined,
          framework: undefined,
          installStampHash: undefined,
        })
      );

      const found = await repo.findByRepoPath('/home/user/mono');
      expect(found!.packageManager).toBeUndefined();
      expect(found!.expectedPort).toBeUndefined();
      expect(found!.language).toBeUndefined();
      expect(found!.framework).toBeUndefined();
      expect(found!.installStampHash).toBeUndefined();
    });

    it('preserves the original createdAt on update', async () => {
      await repo.upsert(makePlan());
      await repo.upsert(makePlan({ createdAt: UPDATED, updatedAt: UPDATED }));

      const found = await repo.findByRepoPath('/home/user/mono');
      expect(found!.createdAt).toEqual(CREATED);
      expect(found!.updatedAt).toEqual(UPDATED);
    });
  });

  describe('stampInstallHash()', () => {
    it('updates only the install stamp hash and bumps updatedAt', async () => {
      await repo.upsert(makePlan());

      await repo.stampInstallHash('/home/user/mono', 'fresh-stamp-hash');

      const found = await repo.findByRepoPath('/home/user/mono');
      expect(found!.installStampHash).toBe('fresh-stamp-hash');
      // Everything else untouched
      expect(found!.command).toBe('pnpm dev');
      expect(found!.configHash).toBe('cfg-hash-v1');
      expect(found!.createdAt).toEqual(CREATED);
      expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(CREATED.getTime());
    });

    it('is a no-op for an unknown repo path', async () => {
      await expect(repo.stampInstallHash('/unknown', 'hash')).resolves.toBeUndefined();
      expect(await repo.findByRepoPath('/unknown')).toBeNull();
    });
  });

  describe('deleteByRepoPath()', () => {
    it('removes the plan for the given repo path', async () => {
      await repo.upsert(makePlan());
      await repo.deleteByRepoPath('/home/user/mono');
      expect(await repo.findByRepoPath('/home/user/mono')).toBeNull();
    });

    it('does not touch other repos plans', async () => {
      await repo.upsert(makePlan());
      await repo.upsert(makePlan({ repoPath: '/home/user/other' }));

      await repo.deleteByRepoPath('/home/user/mono');

      expect(await repo.findByRepoPath('/home/user/mono')).toBeNull();
      expect(await repo.findByRepoPath('/home/user/other')).not.toBeNull();
    });

    it('is a no-op for an unknown repo path', async () => {
      await expect(repo.deleteByRepoPath('/unknown')).resolves.toBeUndefined();
    });
  });
});
