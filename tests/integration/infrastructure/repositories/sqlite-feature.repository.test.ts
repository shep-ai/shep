/**
 * Feature Repository Integration Tests
 *
 * Tests for the SQLite implementation of IFeatureRepository.
 * Verifies CRUD operations, query methods, filtering, and database mapping.
 *
 * TDD Phase: RED
 * - Tests written BEFORE implementation
 * - All tests should FAIL initially
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';

describe('SQLiteFeatureRepository', () => {
  let db: Database.Database;
  let repository: SQLiteFeatureRepository;

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
    mode: FeatureMode.Regular,
    iterationCount: 0,
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

  describe('create()', () => {
    it('should create a feature record', async () => {
      const feature = createTestFeature();

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.id).toBe('feat-1');
      expect(row.name).toBe('Test Feature');
      expect(row.slug).toBe('test-feature');
      expect(row.description).toBe('A test feature');
      expect(row.repository_path).toBe('/home/user/project');
      expect(row.branch).toBe('feat/test-feature');
      expect(row.lifecycle).toBe('Requirements');
    });

    it('should store arrays as JSON strings', async () => {
      const feature = createTestFeature();

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.messages).toBe('[]');
      expect(row.related_artifacts).toBe('[]');
    });

    it('should store optional plan as NULL when not provided', async () => {
      const feature = createTestFeature();

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.plan).toBeNull();
    });

    it('should store optional agentRunId as NULL when not provided', async () => {
      const feature = createTestFeature();

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.agent_run_id).toBeNull();
    });

    it('should store timestamps as unix milliseconds', async () => {
      const feature = createTestFeature();

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.created_at).toBe(new Date('2026-01-01T00:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    });

    it('should store agentRunId when provided', async () => {
      const feature = createTestFeature({ agentRunId: 'run-123' });

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.agent_run_id).toBe('run-123');
    });
  });

  describe('findById()', () => {
    it('should find feature by ID', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const found = await repository.findById('feat-1');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('feat-1');
      expect(found?.name).toBe('Test Feature');
      expect(found?.slug).toBe('test-feature');
      expect(found?.repositoryPath).toBe('/home/user/project');
      expect(found?.lifecycle).toBe(SdlcLifecycle.Requirements);
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent');

      expect(found).toBeNull();
    });

    it('should correctly map timestamps back to Date objects', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const found = await repository.findById('feat-1');

      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found?.updatedAt).toBeInstanceOf(Date);
      expect((found?.createdAt as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('should correctly parse JSON arrays back', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const found = await repository.findById('feat-1');

      expect(found?.messages).toEqual([]);
      expect(found?.relatedArtifacts).toEqual([]);
    });

    it('should return feature with all fields including optional ones', async () => {
      const feature = createTestFeature({ agentRunId: 'run-123' });
      await repository.create(feature);

      const found = await repository.findById('feat-1');

      expect(found?.agentRunId).toBe('run-123');
    });

    it('should not include optional fields when they are NULL', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const found = await repository.findById('feat-1');

      expect(found?.plan).toBeUndefined();
      expect(found?.agentRunId).toBeUndefined();
    });
  });

  describe('findBySlug()', () => {
    it('should find feature by slug and repository path', async () => {
      await repository.create(createTestFeature());

      const found = await repository.findBySlug('test-feature', '/home/user/project');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('feat-1');
      expect(found?.slug).toBe('test-feature');
    });

    it('should return null for wrong repository path', async () => {
      await repository.create(createTestFeature());

      const found = await repository.findBySlug('test-feature', '/other/path');

      expect(found).toBeNull();
    });

    it('should return null for non-existent slug', async () => {
      await repository.create(createTestFeature());

      const found = await repository.findBySlug('non-existent', '/home/user/project');

      expect(found).toBeNull();
    });
  });

  describe('list()', () => {
    it('should list all features', async () => {
      await repository.create(createTestFeature({ id: 'f1' }));
      await repository.create(createTestFeature({ id: 'f2', slug: 'feat-2' }));

      const features = await repository.list();

      expect(features).toHaveLength(2);
    });

    it('should return empty array when no features exist', async () => {
      const features = await repository.list();

      expect(features).toEqual([]);
    });

    it('should filter by repositoryPath', async () => {
      await repository.create(createTestFeature({ id: 'f1', repositoryPath: '/repo/a' }));
      await repository.create(
        createTestFeature({ id: 'f2', slug: 'feat-2', repositoryPath: '/repo/b' })
      );

      const features = await repository.list({ repositoryPath: '/repo/a' });

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f1');
    });

    it('should filter by lifecycle', async () => {
      await repository.create(createTestFeature({ id: 'f1' }));
      await repository.create(
        createTestFeature({
          id: 'f2',
          slug: 'feat-2',
          lifecycle: SdlcLifecycle.Implementation,
        })
      );

      const features = await repository.list({ lifecycle: SdlcLifecycle.Requirements });

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f1');
    });

    it('should filter by both repositoryPath and lifecycle', async () => {
      await repository.create(createTestFeature({ id: 'f1', repositoryPath: '/repo/a' }));
      await repository.create(
        createTestFeature({
          id: 'f2',
          slug: 'feat-2',
          repositoryPath: '/repo/a',
          lifecycle: SdlcLifecycle.Implementation,
        })
      );
      await repository.create(
        createTestFeature({ id: 'f3', slug: 'feat-3', repositoryPath: '/repo/b' })
      );

      const features = await repository.list({
        repositoryPath: '/repo/a',
        lifecycle: SdlcLifecycle.Requirements,
      });

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f1');
    });
  });

  describe('update()', () => {
    it('should update feature fields', async () => {
      await repository.create(createTestFeature());
      const updated = createTestFeature({
        lifecycle: SdlcLifecycle.Implementation,
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      });

      await repository.update(updated);

      const found = await repository.findById('feat-1');
      expect(found?.lifecycle).toBe(SdlcLifecycle.Implementation);
      expect((found?.updatedAt as Date).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('should update name and description', async () => {
      await repository.create(createTestFeature());
      const updated = createTestFeature({
        name: 'Updated Feature',
        description: 'Updated description',
      });

      await repository.update(updated);

      const found = await repository.findById('feat-1');
      expect(found?.name).toBe('Updated Feature');
      expect(found?.description).toBe('Updated description');
    });
  });

  describe('delete()', () => {
    it('should delete a feature', async () => {
      await repository.create(createTestFeature());

      await repository.delete('feat-1');

      const found = await repository.findById('feat-1');
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent ID', async () => {
      await expect(repository.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('archive filtering', () => {
    it('should exclude features with lifecycle=Archived by default', async () => {
      await repository.create(createTestFeature({ id: 'f1' }));
      await repository.create(
        createTestFeature({
          id: 'f2',
          slug: 'archived-feat',
          lifecycle: SdlcLifecycle.Archived,
          previousLifecycle: SdlcLifecycle.Maintain,
        })
      );

      const features = await repository.list();

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f1');
    });

    it('should include Archived features when includeArchived is true', async () => {
      await repository.create(createTestFeature({ id: 'f1' }));
      await repository.create(
        createTestFeature({
          id: 'f2',
          slug: 'archived-feat',
          lifecycle: SdlcLifecycle.Archived,
          previousLifecycle: SdlcLifecycle.Maintain,
        })
      );

      const features = await repository.list({ includeArchived: true });

      expect(features).toHaveLength(2);
    });

    it('should return Archived features when explicit lifecycle filter is set', async () => {
      await repository.create(createTestFeature({ id: 'f1' }));
      await repository.create(
        createTestFeature({
          id: 'f2',
          slug: 'archived-feat',
          lifecycle: SdlcLifecycle.Archived,
          previousLifecycle: SdlcLifecycle.Maintain,
        })
      );

      const features = await repository.list({ lifecycle: SdlcLifecycle.Archived });

      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f2');
    });
  });

  describe('previousLifecycle persistence', () => {
    it('should persist and restore previousLifecycle via create/findById', async () => {
      const feature = createTestFeature({
        lifecycle: SdlcLifecycle.Archived,
        previousLifecycle: SdlcLifecycle.Maintain,
      });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.previousLifecycle).toBe(SdlcLifecycle.Maintain);
    });

    it('should persist previousLifecycle via update', async () => {
      await repository.create(createTestFeature());

      const updated = createTestFeature({
        lifecycle: SdlcLifecycle.Archived,
        previousLifecycle: SdlcLifecycle.Blocked,
        updatedAt: new Date(),
      });
      await repository.update(updated);

      const found = await repository.findById('feat-1');
      expect(found?.lifecycle).toBe(SdlcLifecycle.Archived);
      expect(found?.previousLifecycle).toBe(SdlcLifecycle.Blocked);
    });

    it('should clear previousLifecycle when set to undefined on update', async () => {
      await repository.create(
        createTestFeature({
          lifecycle: SdlcLifecycle.Archived,
          previousLifecycle: SdlcLifecycle.Maintain,
        })
      );

      const updated = createTestFeature({
        lifecycle: SdlcLifecycle.Maintain,
        updatedAt: new Date(),
      });
      await repository.update(updated);

      const found = await repository.findById('feat-1');
      expect(found?.lifecycle).toBe(SdlcLifecycle.Maintain);
      expect(found?.previousLifecycle).toBeUndefined();
    });
  });

  describe('PR and CI fix fields', () => {
    it('should persist and restore PR with ciFixAttempts and ciFixHistory', async () => {
      const history = [
        {
          attempt: 1,
          startedAt: '2025-06-01T10:00:00Z',
          failureSummary: 'Test suite failed: 3 tests in auth module',
          outcome: 'failed',
        },
        {
          attempt: 2,
          startedAt: '2025-06-01T10:05:00Z',
          failureSummary: 'Lint error in utils.ts line 42',
          outcome: 'fixed',
        },
      ];
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/42',
          number: 42,
          status: 'Open' as any,
          commitHash: 'abc123',
          ciStatus: 'Success' as any,
          ciFixAttempts: 2,
          ciFixHistory: history,
        },
      });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.pr).toBeDefined();
      expect(found!.pr!.url).toBe('https://github.com/org/repo/pull/42');
      expect(found!.pr!.number).toBe(42);
      expect(found!.pr!.ciFixAttempts).toBe(2);
      expect(found!.pr!.ciFixHistory).toEqual(history);
    });

    it('should store ci_fix_history as JSON in database', async () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: 'Open' as any,
          ciFixAttempts: 1,
          ciFixHistory: [
            {
              attempt: 1,
              startedAt: '2025-01-01T00:00:00Z',
              failureSummary: 'err',
              outcome: 'fixed',
            },
          ],
        },
      });

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.ci_fix_attempts).toBe(1);
      expect(typeof row.ci_fix_history).toBe('string');
      expect(JSON.parse(row.ci_fix_history as string)).toEqual([
        { attempt: 1, startedAt: '2025-01-01T00:00:00Z', failureSummary: 'err', outcome: 'fixed' },
      ]);
    });

    it('should store NULL for ci_fix fields when PR has no fix data', async () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: 'Open' as any,
          ciStatus: 'Success' as any,
        },
      });

      await repository.create(feature);

      const row = db.prepare('SELECT * FROM features WHERE id = ?').get('feat-1') as Record<
        string,
        unknown
      >;
      expect(row.ci_fix_attempts).toBeNull();
      expect(row.ci_fix_history).toBeNull();
    });

    it('should not include ciFixAttempts/ciFixHistory when NULL in database', async () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: 'Open' as any,
        },
      });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.pr).toBeDefined();
      expect(found!.pr!.ciFixAttempts).toBeUndefined();
      expect(found!.pr!.ciFixHistory).toBeUndefined();
    });

    it('should persist ciFixAttempts via update()', async () => {
      const feature = createTestFeature({
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: 'Open' as any,
        },
      });
      await repository.create(feature);

      await repository.update({
        ...feature,
        pr: {
          ...feature.pr!,
          ciStatus: 'Failure' as any,
          ciFixAttempts: 3,
          ciFixHistory: [
            {
              attempt: 1,
              startedAt: '2025-01-01T00:00:00Z',
              failureSummary: 'fail1',
              outcome: 'failed',
            },
            {
              attempt: 2,
              startedAt: '2025-01-01T00:01:00Z',
              failureSummary: 'fail2',
              outcome: 'failed',
            },
            {
              attempt: 3,
              startedAt: '2025-01-01T00:02:00Z',
              failureSummary: 'fail3',
              outcome: 'timeout',
            },
          ],
        },
        updatedAt: new Date(),
      });

      const found = await repository.findById('feat-1');
      expect(found!.pr!.ciFixAttempts).toBe(3);
      expect(found!.pr!.ciFixHistory).toHaveLength(3);
      expect(found!.pr!.ciFixHistory![2].outcome).toBe('timeout');
    });
  });

  describe('injectSkills persistence', () => {
    it('should persist injectSkills=true via create/findById', async () => {
      const feature = createTestFeature({ injectSkills: true });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.injectSkills).toBe(true);
    });

    it('should persist injectSkills=false via create/findById', async () => {
      const feature = createTestFeature({ injectSkills: false });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.injectSkills).toBe(false);
    });

    it('should persist injectedSkills list via create/findById', async () => {
      const feature = createTestFeature({
        injectSkills: true,
        injectedSkills: ['architecture-reviewer', 'tsp-model'],
      });

      await repository.create(feature);
      const found = await repository.findById('feat-1');

      expect(found?.injectedSkills).toEqual(['architecture-reviewer', 'tsp-model']);
    });

    it('should persist injectedSkills list via update/findById', async () => {
      await repository.create(createTestFeature({ injectSkills: true }));

      await repository.update(
        createTestFeature({
          injectSkills: true,
          injectedSkills: ['tsp-model', 'shadcn-ui'],
          updatedAt: new Date(),
        })
      );
      const found = await repository.findById('feat-1');

      expect(found?.injectedSkills).toEqual(['tsp-model', 'shadcn-ui']);
    });
  });
});
