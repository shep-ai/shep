/**
 * SQLiteClusterRepository Integration Tests
 *
 * Tests for the SQLite implementation of IClusterRepository.
 * Uses an in-memory SQLite database with full migrations applied.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  tableExists,
  getTableIndexes,
} from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteClusterRepository } from '@/infrastructure/repositories/sqlite-cluster.repository.js';
import { ClusterStatus, type Cluster } from '@/domain/generated/output.js';

describe('SQLiteClusterRepository', () => {
  let db: Database.Database;
  let repository: SQLiteClusterRepository;

  const NOW = new Date('2026-03-22T10:00:00Z');

  function createTestCluster(overrides: Partial<Cluster> = {}): Cluster {
    return {
      id: 'cluster-001',
      name: 'Test Cluster',
      slug: 'test-cluster',
      status: ClusterStatus.Stopped,
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      nodeCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  function insertTestRepository(overrides: Record<string, unknown> = {}): void {
    const repo = {
      id: 'repo-001',
      name: 'Test Repo',
      path: '/home/user/test-repo',
      remote_url: null,
      is_fork: 0,
      upstream_url: null,
      created_at: NOW.getTime(),
      updated_at: NOW.getTime(),
      deleted_at: null,
      ...overrides,
    };
    db.prepare(
      `
      INSERT INTO repositories (id, name, path, remote_url, is_fork, upstream_url, created_at, updated_at, deleted_at)
      VALUES (@id, @name, @path, @remote_url, @is_fork, @upstream_url, @created_at, @updated_at, @deleted_at)
    `
    ).run(repo);
  }

  function insertTestApplication(overrides: Record<string, unknown> = {}): void {
    const app = {
      id: 'app-001',
      name: 'Test App',
      slug: 'test-app',
      description: 'A test application',
      repository_path: '/home/user/test-app',
      additional_paths: '[]',
      agent_type: null,
      model_override: null,
      status: 'Idle',
      setup_complete: 0,
      agent_session_id: null,
      git_remote_url: null,
      cloud_deployment_provider: null,
      cloud_deployment_status: null,
      cloud_deployment_id: null,
      cloud_deployment_url: null,
      cloud_deployment_error: null,
      last_deployed_at: null,
      created_at: NOW.getTime(),
      updated_at: NOW.getTime(),
      deleted_at: null,
      ...overrides,
    };
    db.prepare(
      `
      INSERT INTO applications (
        id, name, slug, description, repository_path, additional_paths,
        agent_type, model_override, status, setup_complete, agent_session_id,
        git_remote_url, cloud_deployment_provider, cloud_deployment_status,
        cloud_deployment_id, cloud_deployment_url, cloud_deployment_error,
        last_deployed_at,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @name, @slug, @description, @repository_path, @additional_paths,
        @agent_type, @model_override, @status, @setup_complete, @agent_session_id,
        @git_remote_url, @cloud_deployment_provider, @cloud_deployment_status,
        @cloud_deployment_id, @cloud_deployment_url, @cloud_deployment_error,
        @last_deployed_at,
        @created_at, @updated_at, @deleted_at
      )
    `
    ).run(app);
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'clusters')).toBe(true);
    expect(tableExists(db, 'cluster_repositories')).toBe(true);
    expect(tableExists(db, 'cluster_applications')).toBe(true);
    repository = new SQLiteClusterRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('migrations', () => {
    it('creates clusters table with all expected columns', () => {
      const columns = db.pragma('table_info(clusters)') as { name: string }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('slug');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('k3d_cluster_name');
      expect(columnNames).toContain('kubeconfig_path');
      expect(columnNames).toContain('argocd_enabled');
      expect(columnNames).toContain('argocd_namespace');
      expect(columnNames).toContain('node_count');
      expect(columnNames).toContain('last_provisioned_at');
      expect(columnNames).toContain('last_health_check_at');
      expect(columnNames).toContain('error_message');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('deleted_at');
    });

    it('creates expected indexes on clusters table', () => {
      const indexes = getTableIndexes(db, 'clusters');
      expect(indexes).toContain('idx_clusters_slug');
      expect(indexes).toContain('idx_clusters_status');
    });

    it('creates cluster_repositories junction table with expected indexes', () => {
      const columns = db.pragma('table_info(cluster_repositories)') as { name: string }[];
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('cluster_id');
      expect(columnNames).toContain('repository_id');
      expect(columnNames).toContain('created_at');

      const indexes = getTableIndexes(db, 'cluster_repositories');
      expect(indexes).toContain('idx_cluster_repositories_unique');
      expect(indexes).toContain('idx_cluster_repositories_cluster_id');
      expect(indexes).toContain('idx_cluster_repositories_repository_id');
    });

    it('creates cluster_applications junction table with expected indexes', () => {
      const columns = db.pragma('table_info(cluster_applications)') as { name: string }[];
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('cluster_id');
      expect(columnNames).toContain('application_id');
      expect(columnNames).toContain('created_at');

      const indexes = getTableIndexes(db, 'cluster_applications');
      expect(indexes).toContain('idx_cluster_applications_unique');
      expect(indexes).toContain('idx_cluster_applications_cluster_id');
      expect(indexes).toContain('idx_cluster_applications_application_id');
    });

    it('adds feature_flag_clusters column to settings table', () => {
      const columns = db.pragma('table_info(settings)') as { name: string }[];
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('feature_flag_clusters');
    });

    it('migrations run idempotently (no error on second run)', async () => {
      // Migrations already ran in beforeEach. Running again should not fail.
      await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    });
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a cluster by id', async () => {
      const cluster = createTestCluster();
      await repository.create(cluster);

      const found = await repository.findById('cluster-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('cluster-001');
      expect(found!.name).toBe('Test Cluster');
      expect(found!.slug).toBe('test-cluster');
      expect(found!.status).toBe(ClusterStatus.Stopped);
      expect(found!.argoCdEnabled).toBe(false);
      expect(found!.argoCdNamespace).toBe('argocd');
      expect(found!.nodeCount).toBe(1);
    });

    it('returns null for nonexistent id', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists optional fields correctly', async () => {
      const cluster = createTestCluster({
        description: 'My production cluster',
        k3dClusterName: 'k3d-prod',
        kubeconfigPath: '/home/user/.shep/clusters/abc/kubeconfig',
        argoCdEnabled: true,
        argoCdNamespace: 'custom-argocd',
        lastProvisionedAt: new Date('2026-03-20T10:00:00Z'),
        lastHealthCheckAt: new Date('2026-03-22T08:00:00Z'),
        errorMessage: 'Previous error',
      });
      await repository.create(cluster);

      const found = await repository.findById('cluster-001');
      expect(found!.description).toBe('My production cluster');
      expect(found!.k3dClusterName).toBe('k3d-prod');
      expect(found!.kubeconfigPath).toBe('/home/user/.shep/clusters/abc/kubeconfig');
      expect(found!.argoCdEnabled).toBe(true);
      expect(found!.argoCdNamespace).toBe('custom-argocd');
      expect((found!.lastProvisionedAt as Date).getTime()).toBe(
        new Date('2026-03-20T10:00:00Z').getTime()
      );
      expect((found!.lastHealthCheckAt as Date).getTime()).toBe(
        new Date('2026-03-22T08:00:00Z').getTime()
      );
      expect(found!.errorMessage).toBe('Previous error');
    });
  });

  describe('findBySlug()', () => {
    it('finds a cluster by slug', async () => {
      await repository.create(createTestCluster());

      const found = await repository.findBySlug('test-cluster');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('cluster-001');
    });

    it('returns null for nonexistent slug', async () => {
      const result = await repository.findBySlug('no-such-slug');
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns empty array when no clusters exist', async () => {
      const result = await repository.list();
      expect(result).toHaveLength(0);
    });

    it('returns only non-deleted clusters', async () => {
      await repository.create(createTestCluster({ id: 'cluster-001', slug: 'cluster-one' }));
      await repository.create(
        createTestCluster({ id: 'cluster-002', slug: 'cluster-two', name: 'Second Cluster' })
      );
      await repository.softDelete('cluster-002');

      const result = await repository.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cluster-001');
    });

    it('returns clusters ordered by created_at ascending', async () => {
      const earlier = new Date('2026-01-01T00:00:00Z');
      const later = new Date('2026-06-01T00:00:00Z');
      await repository.create(
        createTestCluster({ id: 'cluster-002', slug: 'cluster-two', createdAt: later })
      );
      await repository.create(
        createTestCluster({ id: 'cluster-001', slug: 'cluster-one', createdAt: earlier })
      );

      const result = await repository.list();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('cluster-001');
      expect(result[1].id).toBe('cluster-002');
    });

    it('filters by status when provided', async () => {
      await repository.create(
        createTestCluster({
          id: 'cluster-001',
          slug: 'stopped-cluster',
          status: ClusterStatus.Stopped,
        })
      );
      await repository.create(
        createTestCluster({
          id: 'cluster-002',
          slug: 'ready-cluster',
          status: ClusterStatus.Ready,
        })
      );
      await repository.create(
        createTestCluster({
          id: 'cluster-003',
          slug: 'another-stopped',
          status: ClusterStatus.Stopped,
        })
      );

      const stoppedOnly = await repository.list(ClusterStatus.Stopped);
      expect(stoppedOnly).toHaveLength(2);
      expect(stoppedOnly[0].id).toBe('cluster-001');
      expect(stoppedOnly[1].id).toBe('cluster-003');

      const readyOnly = await repository.list(ClusterStatus.Ready);
      expect(readyOnly).toHaveLength(1);
      expect(readyOnly[0].id).toBe('cluster-002');
    });
  });

  describe('update()', () => {
    it('updates the name field', async () => {
      await repository.create(createTestCluster());
      await repository.update('cluster-001', { name: 'Renamed Cluster' });

      const found = await repository.findById('cluster-001');
      expect(found!.name).toBe('Renamed Cluster');
    });

    it('updates the status field', async () => {
      await repository.create(createTestCluster());
      await repository.update('cluster-001', { status: ClusterStatus.Ready });

      const found = await repository.findById('cluster-001');
      expect(found!.status).toBe(ClusterStatus.Ready);
    });

    it('updates argoCdEnabled boolean', async () => {
      await repository.create(createTestCluster());
      await repository.update('cluster-001', { argoCdEnabled: true });

      const found = await repository.findById('cluster-001');
      expect(found!.argoCdEnabled).toBe(true);
    });

    it('updates multiple fields at once', async () => {
      await repository.create(createTestCluster());
      await repository.update('cluster-001', {
        name: 'Updated Cluster',
        slug: 'updated-cluster',
        status: ClusterStatus.Provisioning,
        k3dClusterName: 'k3d-updated',
        kubeconfigPath: '/tmp/kubeconfig',
        argoCdEnabled: true,
        errorMessage: 'test error',
      });

      const found = await repository.findById('cluster-001');
      expect(found!.name).toBe('Updated Cluster');
      expect(found!.slug).toBe('updated-cluster');
      expect(found!.status).toBe(ClusterStatus.Provisioning);
      expect(found!.k3dClusterName).toBe('k3d-updated');
      expect(found!.kubeconfigPath).toBe('/tmp/kubeconfig');
      expect(found!.argoCdEnabled).toBe(true);
      expect(found!.errorMessage).toBe('test error');
    });

    it('updates updated_at timestamp', async () => {
      await repository.create(createTestCluster());
      const before = Date.now();
      await repository.update('cluster-001', { name: 'New Name' });
      const after = Date.now();

      const row = db.prepare('SELECT updated_at FROM clusters WHERE id = ?').get('cluster-001') as {
        updated_at: number;
      };
      expect(row.updated_at).toBeGreaterThanOrEqual(before);
      expect(row.updated_at).toBeLessThanOrEqual(after);
    });

    it('updates optional date fields', async () => {
      await repository.create(createTestCluster());
      const provisioned = new Date('2026-04-01T10:00:00Z');
      const healthCheck = new Date('2026-04-02T08:00:00Z');
      await repository.update('cluster-001', {
        lastProvisionedAt: provisioned,
        lastHealthCheckAt: healthCheck,
      });

      const found = await repository.findById('cluster-001');
      expect((found!.lastProvisionedAt as Date).getTime()).toBe(provisioned.getTime());
      expect((found!.lastHealthCheckAt as Date).getTime()).toBe(healthCheck.getTime());
    });

    it('updating one field does not zero others', async () => {
      await repository.create(
        createTestCluster({
          description: 'Original desc',
          argoCdEnabled: true,
          k3dClusterName: 'k3d-test',
        })
      );
      await repository.update('cluster-001', { status: ClusterStatus.Ready });

      const found = await repository.findById('cluster-001');
      expect(found!.description).toBe('Original desc');
      expect(found!.argoCdEnabled).toBe(true);
      expect(found!.k3dClusterName).toBe('k3d-test');
    });
  });

  describe('softDelete()', () => {
    it('sets deleted_at so the record is no longer returned by findById', async () => {
      await repository.create(createTestCluster());
      await repository.softDelete('cluster-001');

      const found = await repository.findById('cluster-001');
      expect(found).toBeNull();
    });

    it('sets deleted_at in the database row', async () => {
      const before = Date.now();
      await repository.create(createTestCluster());
      await repository.softDelete('cluster-001');
      const after = Date.now();

      const row = db.prepare('SELECT deleted_at FROM clusters WHERE id = ?').get('cluster-001') as {
        deleted_at: number | null;
      };
      expect(row.deleted_at).not.toBeNull();
      expect(row.deleted_at!).toBeGreaterThanOrEqual(before);
      expect(row.deleted_at!).toBeLessThanOrEqual(after);
    });
  });

  describe('linkRepository() and getLinkedRepositories()', () => {
    it('links a repository and retrieves it', async () => {
      await repository.create(createTestCluster());
      insertTestRepository();

      const link = await repository.linkRepository('cluster-001', 'repo-001');
      expect(link.clusterId).toBe('cluster-001');
      expect(link.repositoryId).toBe('repo-001');
      expect(link.id).toBeDefined();

      const repos = await repository.getLinkedRepositories('cluster-001');
      expect(repos).toHaveLength(1);
      expect(repos[0].id).toBe('repo-001');
      expect(repos[0].name).toBe('Test Repo');
      expect(repos[0].path).toBe('/home/user/test-repo');
    });

    it('returns empty array when no repositories linked', async () => {
      await repository.create(createTestCluster());
      const repos = await repository.getLinkedRepositories('cluster-001');
      expect(repos).toHaveLength(0);
    });

    it('does not return soft-deleted repositories', async () => {
      await repository.create(createTestCluster());
      insertTestRepository();
      await repository.linkRepository('cluster-001', 'repo-001');

      // Soft-delete the repository
      db.prepare('UPDATE repositories SET deleted_at = ? WHERE id = ?').run(Date.now(), 'repo-001');

      const repos = await repository.getLinkedRepositories('cluster-001');
      expect(repos).toHaveLength(0);
    });

    it('prevents duplicate links via unique index', async () => {
      await repository.create(createTestCluster());
      insertTestRepository();

      await repository.linkRepository('cluster-001', 'repo-001');
      expect(() => {
        db.prepare(
          'INSERT INTO cluster_repositories (id, cluster_id, repository_id, created_at) VALUES (?, ?, ?, ?)'
        ).run('dup-id', 'cluster-001', 'repo-001', Date.now());
      }).toThrow();
    });
  });

  describe('unlinkRepository()', () => {
    it('removes a repository link', async () => {
      await repository.create(createTestCluster());
      insertTestRepository();
      await repository.linkRepository('cluster-001', 'repo-001');

      await repository.unlinkRepository('cluster-001', 'repo-001');

      const repos = await repository.getLinkedRepositories('cluster-001');
      expect(repos).toHaveLength(0);
    });

    it('is idempotent (no error when link does not exist)', async () => {
      await repository.create(createTestCluster());
      await expect(repository.unlinkRepository('cluster-001', 'repo-001')).resolves.not.toThrow();
    });
  });

  describe('linkApplication() and getLinkedApplications()', () => {
    it('links an application and retrieves it', async () => {
      await repository.create(createTestCluster());
      insertTestApplication();

      const link = await repository.linkApplication('cluster-001', 'app-001');
      expect(link.clusterId).toBe('cluster-001');
      expect(link.applicationId).toBe('app-001');
      expect(link.id).toBeDefined();

      const apps = await repository.getLinkedApplications('cluster-001');
      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('app-001');
      expect(apps[0].name).toBe('Test App');
      expect(apps[0].slug).toBe('test-app');
    });

    it('returns empty array when no applications linked', async () => {
      await repository.create(createTestCluster());
      const apps = await repository.getLinkedApplications('cluster-001');
      expect(apps).toHaveLength(0);
    });

    it('does not return soft-deleted applications', async () => {
      await repository.create(createTestCluster());
      insertTestApplication();
      await repository.linkApplication('cluster-001', 'app-001');

      // Soft-delete the application
      db.prepare('UPDATE applications SET deleted_at = ? WHERE id = ?').run(Date.now(), 'app-001');

      const apps = await repository.getLinkedApplications('cluster-001');
      expect(apps).toHaveLength(0);
    });

    it('prevents duplicate links via unique index', async () => {
      await repository.create(createTestCluster());
      insertTestApplication();

      await repository.linkApplication('cluster-001', 'app-001');
      expect(() => {
        db.prepare(
          'INSERT INTO cluster_applications (id, cluster_id, application_id, created_at) VALUES (?, ?, ?, ?)'
        ).run('dup-id', 'cluster-001', 'app-001', Date.now());
      }).toThrow();
    });
  });

  describe('unlinkApplication()', () => {
    it('removes an application link', async () => {
      await repository.create(createTestCluster());
      insertTestApplication();
      await repository.linkApplication('cluster-001', 'app-001');

      await repository.unlinkApplication('cluster-001', 'app-001');

      const apps = await repository.getLinkedApplications('cluster-001');
      expect(apps).toHaveLength(0);
    });

    it('is idempotent (no error when link does not exist)', async () => {
      await repository.create(createTestCluster());
      await expect(repository.unlinkApplication('cluster-001', 'app-001')).resolves.not.toThrow();
    });
  });

  describe('slug uniqueness', () => {
    it('allows same slug after soft-delete (partial unique index)', async () => {
      await repository.create(createTestCluster({ id: 'cluster-001', slug: 'same-slug' }));
      await repository.softDelete('cluster-001');

      // Should be able to create a new cluster with the same slug
      await expect(
        repository.create(createTestCluster({ id: 'cluster-002', slug: 'same-slug' }))
      ).resolves.not.toThrow();
    });

    it('prevents duplicate slugs among non-deleted clusters', async () => {
      await repository.create(createTestCluster({ id: 'cluster-001', slug: 'same-slug' }));

      expect(() => {
        db.prepare(
          `
          INSERT INTO clusters (id, name, slug, status, argocd_enabled, argocd_namespace, node_count, created_at, updated_at)
          VALUES ('cluster-002', 'Dup', 'same-slug', 'Stopped', 0, 'argocd', 1, ${Date.now()}, ${Date.now()})
        `
        ).run();
      }).toThrow();
    });
  });
});
