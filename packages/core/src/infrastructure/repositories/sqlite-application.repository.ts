/**
 * SQLite Application Repository Implementation
 *
 * Implements IApplicationRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import type { Application } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ApplicationRow,
} from '../persistence/sqlite/mappers/application.mapper.js';

@injectable()
export class SQLiteApplicationRepository implements IApplicationRepository {
  constructor(private readonly db: Database.Database) {}

  async create(application: Application): Promise<void> {
    const row = toDatabase(application);
    const stmt = this.db.prepare(`
      INSERT INTO applications (
        id, name, slug, description, repository_path, additional_paths,
        agent_type, model_override, status, setup_complete, agent_session_id,
        git_remote_url, cloud_deployment_provider, cloud_deployment_status,
        cloud_deployment_id, cloud_deployment_url, cloud_deployment_error,
        last_deployed_at, bedrock_enabled,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @name, @slug, @description, @repository_path, @additional_paths,
        @agent_type, @model_override, @status, @setup_complete, @agent_session_id,
        @git_remote_url, @cloud_deployment_provider, @cloud_deployment_status,
        @cloud_deployment_id, @cloud_deployment_url, @cloud_deployment_error,
        @last_deployed_at, @bedrock_enabled,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Application | null> {
    const stmt = this.db.prepare('SELECT * FROM applications WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE slug = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(slug) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByPath(path: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM applications WHERE REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(path.replace(/\\/g, '/')) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<Application[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as ApplicationRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        Application,
        | 'name'
        | 'status'
        | 'additionalPaths'
        | 'agentType'
        | 'modelOverride'
        | 'setupComplete'
        | 'agentSessionId'
        | 'gitRemoteUrl'
        | 'cloudDeploymentProvider'
        | 'cloudDeploymentStatus'
        | 'cloudDeploymentId'
        | 'cloudDeploymentUrl'
        | 'cloudDeploymentError'
        | 'lastDeployedAt'
        | 'bedrockEnabled'
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
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.additionalPaths !== undefined) {
      setClauses.push('additional_paths = ?');
      values.push(JSON.stringify(fields.additionalPaths));
    }
    if (fields.agentType !== undefined) {
      setClauses.push('agent_type = ?');
      values.push(fields.agentType);
    }
    if (fields.modelOverride !== undefined) {
      setClauses.push('model_override = ?');
      values.push(fields.modelOverride);
    }
    if (fields.setupComplete !== undefined) {
      setClauses.push('setup_complete = ?');
      values.push(fields.setupComplete ? 1 : 0);
    }
    if (fields.agentSessionId !== undefined) {
      setClauses.push('agent_session_id = ?');
      values.push(fields.agentSessionId);
    }
    if (fields.gitRemoteUrl !== undefined) {
      setClauses.push('git_remote_url = ?');
      values.push(fields.gitRemoteUrl);
    }
    if (fields.cloudDeploymentProvider !== undefined) {
      setClauses.push('cloud_deployment_provider = ?');
      values.push(fields.cloudDeploymentProvider);
    }
    if (fields.cloudDeploymentStatus !== undefined) {
      setClauses.push('cloud_deployment_status = ?');
      values.push(fields.cloudDeploymentStatus);
    }
    if (fields.cloudDeploymentId !== undefined) {
      setClauses.push('cloud_deployment_id = ?');
      values.push(fields.cloudDeploymentId);
    }
    if (fields.cloudDeploymentUrl !== undefined) {
      setClauses.push('cloud_deployment_url = ?');
      values.push(fields.cloudDeploymentUrl);
    }
    if (fields.cloudDeploymentError !== undefined) {
      setClauses.push('cloud_deployment_error = ?');
      values.push(fields.cloudDeploymentError);
    }
    if (fields.lastDeployedAt !== undefined) {
      setClauses.push('last_deployed_at = ?');
      values.push(
        fields.lastDeployedAt instanceof Date
          ? fields.lastDeployedAt.getTime()
          : fields.lastDeployedAt
      );
    }
    if (fields.bedrockEnabled !== undefined) {
      setClauses.push('bedrock_enabled = ?');
      values.push(fields.bedrockEnabled ? 1 : 0);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE applications SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async restore(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = NULL, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, id);
  }
}
