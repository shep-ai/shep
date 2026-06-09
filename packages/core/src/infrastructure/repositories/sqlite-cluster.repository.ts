/**
 * SQLite Cluster Repository Implementation
 *
 * Implements IClusterRepository using better-sqlite3.
 * Handles CRUD for the clusters table and junction table management
 * for cluster_repositories and cluster_applications.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IClusterRepository } from '../../application/ports/output/repositories/cluster-repository.interface.js';
import type {
  Cluster,
  ClusterStatus,
  ClusterRepository,
  ClusterApplication,
  Application,
  Repository,
} from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ClusterRow,
} from '../persistence/sqlite/mappers/cluster.mapper.js';
import {
  fromDatabase as applicationFromDatabase,
  type ApplicationRow,
} from '../persistence/sqlite/mappers/application.mapper.js';
import {
  fromDatabase as repositoryFromDatabase,
  type RepositoryRow,
} from '../persistence/sqlite/mappers/repository.mapper.js';

@injectable()
export class SQLiteClusterRepository implements IClusterRepository {
  constructor(private readonly db: Database.Database) {}

  async create(cluster: Cluster): Promise<void> {
    const row = toDatabase(cluster);
    const stmt = this.db.prepare(`
      INSERT INTO clusters (
        id, name, slug, description, status,
        k3d_cluster_name, kubeconfig_path,
        argocd_enabled, argocd_namespace, node_count,
        last_provisioned_at, last_health_check_at, error_message,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @name, @slug, @description, @status,
        @k3d_cluster_name, @kubeconfig_path,
        @argocd_enabled, @argocd_namespace, @node_count,
        @last_provisioned_at, @last_health_check_at, @error_message,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Cluster | null> {
    const stmt = this.db.prepare('SELECT * FROM clusters WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as ClusterRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Cluster | null> {
    const stmt = this.db.prepare('SELECT * FROM clusters WHERE slug = ? AND deleted_at IS NULL');
    const row = stmt.get(slug) as ClusterRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(status?: ClusterStatus): Promise<Cluster[]> {
    if (status) {
      const stmt = this.db.prepare(
        'SELECT * FROM clusters WHERE deleted_at IS NULL AND status = ? ORDER BY created_at ASC'
      );
      const rows = stmt.all(status) as ClusterRow[];
      return rows.map(fromDatabase);
    }

    const stmt = this.db.prepare(
      'SELECT * FROM clusters WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as ClusterRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        Cluster,
        | 'name'
        | 'slug'
        | 'description'
        | 'status'
        | 'k3dClusterName'
        | 'kubeconfigPath'
        | 'argoCdEnabled'
        | 'argoCdNamespace'
        | 'nodeCount'
        | 'lastProvisionedAt'
        | 'lastHealthCheckAt'
        | 'errorMessage'
      >
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.slug !== undefined) {
      setClauses.push('slug = ?');
      values.push(fields.slug);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.k3dClusterName !== undefined) {
      setClauses.push('k3d_cluster_name = ?');
      values.push(fields.k3dClusterName);
    }
    if (fields.kubeconfigPath !== undefined) {
      setClauses.push('kubeconfig_path = ?');
      values.push(fields.kubeconfigPath);
    }
    if (fields.argoCdEnabled !== undefined) {
      setClauses.push('argocd_enabled = ?');
      values.push(fields.argoCdEnabled ? 1 : 0);
    }
    if (fields.argoCdNamespace !== undefined) {
      setClauses.push('argocd_namespace = ?');
      values.push(fields.argoCdNamespace);
    }
    if (fields.nodeCount !== undefined) {
      setClauses.push('node_count = ?');
      values.push(fields.nodeCount);
    }
    if (fields.lastProvisionedAt !== undefined) {
      setClauses.push('last_provisioned_at = ?');
      values.push(
        fields.lastProvisionedAt instanceof Date
          ? fields.lastProvisionedAt.getTime()
          : fields.lastProvisionedAt
      );
    }
    if (fields.lastHealthCheckAt !== undefined) {
      setClauses.push('last_health_check_at = ?');
      values.push(
        fields.lastHealthCheckAt instanceof Date
          ? fields.lastHealthCheckAt.getTime()
          : fields.lastHealthCheckAt
      );
    }
    if (fields.errorMessage !== undefined) {
      setClauses.push('error_message = ?');
      values.push(fields.errorMessage);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE clusters SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE clusters SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }

  async linkRepository(clusterId: string, repositoryId: string): Promise<ClusterRepository> {
    const id = randomUUID();
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO cluster_repositories (id, cluster_id, repository_id, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, clusterId, repositoryId, now);
    return {
      id,
      clusterId,
      repositoryId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async unlinkRepository(clusterId: string, repositoryId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM cluster_repositories WHERE cluster_id = ? AND repository_id = ?'
    );
    stmt.run(clusterId, repositoryId);
  }

  async getLinkedRepositories(clusterId: string): Promise<Repository[]> {
    const stmt = this.db.prepare(`
      SELECT r.* FROM repositories r
      INNER JOIN cluster_repositories cr ON cr.repository_id = r.id
      WHERE cr.cluster_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
    `);
    const rows = stmt.all(clusterId) as RepositoryRow[];
    return rows.map(repositoryFromDatabase);
  }

  async linkApplication(clusterId: string, applicationId: string): Promise<ClusterApplication> {
    const id = randomUUID();
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO cluster_applications (id, cluster_id, application_id, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, clusterId, applicationId, now);
    return {
      id,
      clusterId,
      applicationId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async unlinkApplication(clusterId: string, applicationId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM cluster_applications WHERE cluster_id = ? AND application_id = ?'
    );
    stmt.run(clusterId, applicationId);
  }

  async getLinkedApplications(clusterId: string): Promise<Application[]> {
    const stmt = this.db.prepare(`
      SELECT a.* FROM applications a
      INNER JOIN cluster_applications ca ON ca.application_id = a.id
      WHERE ca.cluster_id = ? AND a.deleted_at IS NULL
      ORDER BY a.created_at ASC
    `);
    const rows = stmt.all(clusterId) as ApplicationRow[];
    return rows.map(applicationFromDatabase);
  }
}
