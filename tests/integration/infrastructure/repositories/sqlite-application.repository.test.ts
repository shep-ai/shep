/**
 * SQLiteApplicationRepository Integration Tests
 *
 * Tests for the SQLite implementation of IApplicationRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteApplicationRepository } from '@/infrastructure/repositories/sqlite-application.repository.js';
import {
  ApplicationStatus,
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  type Application,
} from '@/domain/generated/output.js';

describe('SQLiteApplicationRepository', () => {
  let db: Database.Database;
  let repository: SQLiteApplicationRepository;

  const NOW = new Date('2026-03-22T10:00:00Z');

  function createTestApplication(overrides: Partial<Application> = {}): Application {
    return {
      id: 'app-001',
      name: 'Test App',
      slug: 'test-app',
      description: 'A test application',
      repositoryPath: '/home/user/projects/test-app',
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      setupComplete: false,
      bedrockEnabled: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'applications')).toBe(true);
    repository = new SQLiteApplicationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create() and findById()', () => {
    it('creates and retrieves an application by id', async () => {
      const app = createTestApplication();
      await repository.create(app);

      const found = await repository.findById('app-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('app-001');
      expect(found!.name).toBe('Test App');
      expect(found!.slug).toBe('test-app');
      expect(found!.description).toBe('A test application');
      expect(found!.repositoryPath).toBe('/home/user/projects/test-app');
      expect(found!.additionalPaths).toEqual([]);
      expect(found!.status).toBe(ApplicationStatus.Idle);
      expect(found!.agentType).toBeUndefined();
      expect(found!.modelOverride).toBeUndefined();
    });

    it('returns null for nonexistent id', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const app = createTestApplication({
        agentType: 'claude',
        modelOverride: 'claude-3-opus',
        additionalPaths: ['/home/user/projects/extra'],
      });
      await repository.create(app);

      const found = await repository.findById('app-001');
      expect(found!.agentType).toBe('claude');
      expect(found!.modelOverride).toBe('claude-3-opus');
      expect(found!.additionalPaths).toEqual(['/home/user/projects/extra']);
    });
  });

  describe('findBySlug()', () => {
    it('finds an application by slug', async () => {
      await repository.create(createTestApplication());

      const found = await repository.findBySlug('test-app');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('app-001');
    });

    it('returns null for nonexistent slug', async () => {
      const result = await repository.findBySlug('no-such-slug');
      expect(result).toBeNull();
    });
  });

  describe('findByPath()', () => {
    it('finds an application by repository path', async () => {
      await repository.create(createTestApplication());

      const found = await repository.findByPath('/home/user/projects/test-app');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('app-001');
    });

    it('returns null for nonexistent path', async () => {
      const result = await repository.findByPath('/no/such/path');
      expect(result).toBeNull();
    });

    it('matches path with cross-platform normalization (backslashes)', async () => {
      const app = createTestApplication({
        repositoryPath: 'C:/Users/user/projects/test-app',
      });
      await repository.create(app);

      // Query with backslash-style path — should still match after normalization
      const found = await repository.findByPath('C:\\Users\\user\\projects\\test-app');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('app-001');
    });
  });

  describe('list()', () => {
    it('returns empty array when no applications exist', async () => {
      const result = await repository.list();
      expect(result).toHaveLength(0);
    });

    it('returns only non-deleted applications', async () => {
      await repository.create(createTestApplication({ id: 'app-001', slug: 'app-one' }));
      await repository.create(
        createTestApplication({ id: 'app-002', slug: 'app-two', name: 'Second App' })
      );
      await repository.softDelete('app-002');

      const result = await repository.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('app-001');
    });

    it('returns applications ordered by created_at ascending', async () => {
      const earlier = new Date('2026-01-01T00:00:00Z');
      const later = new Date('2026-06-01T00:00:00Z');
      await repository.create(
        createTestApplication({ id: 'app-002', slug: 'app-two', createdAt: later })
      );
      await repository.create(
        createTestApplication({ id: 'app-001', slug: 'app-one', createdAt: earlier })
      );

      const result = await repository.list();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('app-001');
      expect(result[1].id).toBe('app-002');
    });
  });

  describe('update()', () => {
    it('updates the name field', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', { name: 'Renamed App' });

      const found = await repository.findById('app-001');
      expect(found!.name).toBe('Renamed App');
    });

    it('updates the status field', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', { status: ApplicationStatus.Active });

      const found = await repository.findById('app-001');
      expect(found!.status).toBe(ApplicationStatus.Active);
    });

    it('updates additionalPaths as JSON', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', {
        additionalPaths: ['/path/one', '/path/two'],
      });

      const found = await repository.findById('app-001');
      expect(found!.additionalPaths).toEqual(['/path/one', '/path/two']);
    });

    it('updates multiple fields at once', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', {
        name: 'Updated App',
        status: ApplicationStatus.Error,
        agentType: 'openai',
        modelOverride: 'gpt-4',
      });

      const found = await repository.findById('app-001');
      expect(found!.name).toBe('Updated App');
      expect(found!.status).toBe(ApplicationStatus.Error);
      expect(found!.agentType).toBe('openai');
      expect(found!.modelOverride).toBe('gpt-4');
    });

    it('updates updated_at timestamp', async () => {
      await repository.create(createTestApplication());
      const before = Date.now();
      await repository.update('app-001', { name: 'New Name' });
      const after = Date.now();

      const row = db.prepare('SELECT updated_at FROM applications WHERE id = ?').get('app-001') as {
        updated_at: number;
      };
      expect(row.updated_at).toBeGreaterThanOrEqual(before);
      expect(row.updated_at).toBeLessThanOrEqual(after);
    });
  });

  describe('softDelete()', () => {
    it('sets deleted_at so the record is no longer returned by findById', async () => {
      await repository.create(createTestApplication());
      await repository.softDelete('app-001');

      const found = await repository.findById('app-001');
      expect(found).toBeNull();
    });

    it('sets deleted_at in the database row', async () => {
      const before = Date.now();
      await repository.create(createTestApplication());
      await repository.softDelete('app-001');
      const after = Date.now();

      const row = db.prepare('SELECT deleted_at FROM applications WHERE id = ?').get('app-001') as {
        deleted_at: number | null;
      };
      expect(row.deleted_at).not.toBeNull();
      expect(row.deleted_at!).toBeGreaterThanOrEqual(before);
      expect(row.deleted_at!).toBeLessThanOrEqual(after);
    });
  });

  describe('restore()', () => {
    it('clears deleted_at so the record is returned by findById again', async () => {
      await repository.create(createTestApplication());
      await repository.softDelete('app-001');

      const deletedCheck = await repository.findById('app-001');
      expect(deletedCheck).toBeNull();

      await repository.restore('app-001');

      const restored = await repository.findById('app-001');
      expect(restored).not.toBeNull();
      expect(restored!.id).toBe('app-001');
    });

    it('restored application appears in list()', async () => {
      await repository.create(createTestApplication());
      await repository.softDelete('app-001');
      await repository.restore('app-001');

      const result = await repository.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('app-001');
    });
  });

  describe('bedrockEnabled (project-bedrock integration)', () => {
    it('defaults bedrockEnabled to false when created without an override', async () => {
      await repository.create(createTestApplication());

      const found = await repository.findById('app-001');
      expect(found!.bedrockEnabled).toBe(false);
    });

    it('persists bedrockEnabled=true via create() and round-trips through findById()', async () => {
      await repository.create(createTestApplication({ bedrockEnabled: true }));

      const found = await repository.findById('app-001');
      expect(found!.bedrockEnabled).toBe(true);
    });

    it('updates bedrockEnabled from false to true', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', { bedrockEnabled: true });

      const found = await repository.findById('app-001');
      expect(found!.bedrockEnabled).toBe(true);
    });

    it('updates bedrockEnabled from true to false', async () => {
      await repository.create(createTestApplication({ bedrockEnabled: true }));
      await repository.update('app-001', { bedrockEnabled: false });

      const found = await repository.findById('app-001');
      expect(found!.bedrockEnabled).toBe(false);
    });
  });

  describe('cloud-deploy fields (spec 089)', () => {
    it('persists and loads gitRemoteUrl', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', { gitRemoteUrl: 'https://github.com/user/repo' });
      const found = await repository.findById('app-001');
      expect(found!.gitRemoteUrl).toBe('https://github.com/user/repo');
    });

    it('persists and loads cloudDeploymentProvider and cloudDeploymentStatus', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', {
        cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
        cloudDeploymentStatus: CloudDeploymentStatus.Deployed,
      });
      const found = await repository.findById('app-001');
      expect(found!.cloudDeploymentProvider).toBe(CloudDeploymentProvider.CloudflarePages);
      expect(found!.cloudDeploymentStatus).toBe(CloudDeploymentStatus.Deployed);
    });

    it('persists deployment metadata (id, url, error, lastDeployedAt)', async () => {
      await repository.create(createTestApplication());
      const deployedAt = new Date('2026-04-14T10:00:00Z');
      await repository.update('app-001', {
        cloudDeploymentId: 'dep-abc',
        cloudDeploymentUrl: 'https://my-app.pages.dev',
        cloudDeploymentError: 'transient error',
        lastDeployedAt: deployedAt,
      });
      const found = await repository.findById('app-001');
      expect(found!.cloudDeploymentId).toBe('dep-abc');
      expect(found!.cloudDeploymentUrl).toBe('https://my-app.pages.dev');
      expect(found!.cloudDeploymentError).toBe('transient error');
      expect((found!.lastDeployedAt as Date).getTime()).toBe(deployedAt.getTime());
    });

    it('updating one cloud field does not zero the others', async () => {
      await repository.create(createTestApplication());
      await repository.update('app-001', {
        cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
        cloudDeploymentStatus: CloudDeploymentStatus.Deployed,
        cloudDeploymentUrl: 'https://live.example/',
      });
      await repository.update('app-001', {
        cloudDeploymentStatus: CloudDeploymentStatus.Failed,
        cloudDeploymentError: 'bad token',
      });
      const found = await repository.findById('app-001');
      expect(found!.cloudDeploymentProvider).toBe(CloudDeploymentProvider.CloudflarePages);
      expect(found!.cloudDeploymentStatus).toBe(CloudDeploymentStatus.Failed);
      expect(found!.cloudDeploymentUrl).toBe('https://live.example/');
      expect(found!.cloudDeploymentError).toBe('bad token');
    });

    it('round-trips cloud fields via create()', async () => {
      const now = new Date('2026-04-14T10:00:00Z');
      await repository.create(
        createTestApplication({
          id: 'app-full',
          slug: 'full',
          gitRemoteUrl: 'https://github.com/u/f',
          cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
          cloudDeploymentStatus: CloudDeploymentStatus.Deployed,
          cloudDeploymentId: 'dep-1',
          cloudDeploymentUrl: 'https://f.pages.dev',
          lastDeployedAt: now,
        })
      );
      const found = await repository.findById('app-full');
      expect(found!.gitRemoteUrl).toBe('https://github.com/u/f');
      expect(found!.cloudDeploymentProvider).toBe(CloudDeploymentProvider.CloudflarePages);
      expect(found!.cloudDeploymentStatus).toBe(CloudDeploymentStatus.Deployed);
      expect(found!.cloudDeploymentId).toBe('dep-1');
      expect(found!.cloudDeploymentUrl).toBe('https://f.pages.dev');
      expect((found!.lastDeployedAt as Date).getTime()).toBe(now.getTime());
    });
  });
});
