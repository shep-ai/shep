/**
 * SQLite Feature Repository Implementation
 *
 * Implements IFeatureRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 * Excludes soft-deleted features (deleted_at IS NOT NULL) from queries by default.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IFeatureRepository,
  FeatureListFilters,
} from '../../application/ports/output/repositories/feature-repository.interface.js';
import type { Feature } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type FeatureRow,
} from '../persistence/sqlite/mappers/feature.mapper.js';

/**
 * SQLite implementation of IFeatureRepository.
 * Manages Feature persistence with CRUD operations.
 */
@injectable()
export class SQLiteFeatureRepository implements IFeatureRepository {
  constructor(private readonly db: Database.Database) {}

  async create(feature: Feature): Promise<void> {
    const row = toDatabase(feature);

    const stmt = this.db.prepare(`
      INSERT INTO features (
        id, name, slug, description, user_query, repository_path, branch,
        lifecycle, messages, plan, related_artifacts,
        agent_run_id, spec_path,
        mode, iteration_count, max_iterations,
        push, open_pr, fork_and_pr, commit_specs,
        ci_watch_enabled, enable_evidence, commit_evidence,
        auto_merge, allow_prd, allow_plan, allow_merge,
        worktree_path, repository_id,
        pr_url, pr_number, pr_status, commit_hash, ci_status,
        ci_fix_attempts, ci_fix_history, pr_mergeable,
        upstream_pr_url, upstream_pr_number, upstream_pr_status,
        parent_id, previous_lifecycle, attachments,
        inject_skills, injected_skills,
        deleted_at, created_at, updated_at
      ) VALUES (
        @id, @name, @slug, @description, @user_query, @repository_path, @branch,
        @lifecycle, @messages, @plan, @related_artifacts,
        @agent_run_id, @spec_path,
        @mode, @iteration_count, @max_iterations,
        @push, @open_pr, @fork_and_pr, @commit_specs,
        @ci_watch_enabled, @enable_evidence, @commit_evidence,
        @auto_merge, @allow_prd, @allow_plan, @allow_merge,
        @worktree_path, @repository_id,
        @pr_url, @pr_number, @pr_status, @commit_hash, @ci_status,
        @ci_fix_attempts, @ci_fix_history, @pr_mergeable,
        @upstream_pr_url, @upstream_pr_number, @upstream_pr_status,
        @parent_id, @previous_lifecycle, @attachments,
        @inject_skills, @injected_skills,
        @deleted_at, @created_at, @updated_at
      )
    `);

    stmt.run(row);
  }

  async findById(id: string): Promise<Feature | null> {
    const stmt = this.db.prepare('SELECT * FROM features WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as FeatureRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByIdPrefix(prefix: string): Promise<Feature | null> {
    const stmt = this.db.prepare('SELECT * FROM features WHERE id LIKE ? AND deleted_at IS NULL');
    const rows = stmt.all(`${prefix}%`) as FeatureRow[];

    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(
        `Ambiguous ID prefix "${prefix}" matches ${rows.length} features. Use a longer prefix.`
      );
    }

    return fromDatabase(rows[0]);
  }

  async findBySlug(slug: string, repositoryPath: string): Promise<Feature | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM features WHERE slug = ? AND REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(slug, repositoryPath.replace(/\\/g, '/')) as FeatureRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByBranch(branch: string, repositoryPath: string): Promise<Feature | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM features WHERE branch = ? AND REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(branch, repositoryPath.replace(/\\/g, '/')) as FeatureRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async list(filters?: FeatureListFilters): Promise<Feature[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filters?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (!filters?.includeArchived && !filters?.lifecycle) {
      conditions.push('lifecycle != ?');
      params.push('Archived');
    }

    if (filters?.repositoryPath) {
      conditions.push("REPLACE(repository_path, '\\', '/') = ?");
      params.push(filters.repositoryPath.replace(/\\/g, '/'));
    }

    if (filters?.lifecycle) {
      conditions.push('lifecycle = ?');
      params.push(filters.lifecycle);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(`SELECT * FROM features${where} ORDER BY created_at ASC`);
    const rows = stmt.all(...params) as FeatureRow[];

    return rows.map(fromDatabase);
  }

  async findByParentId(parentId: string): Promise<Feature[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM features WHERE parent_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(parentId) as FeatureRow[];
    return rows.map(fromDatabase);
  }

  async update(feature: Feature): Promise<void> {
    const row = toDatabase(feature);

    const stmt = this.db.prepare(`
      UPDATE features SET
        name = @name,
        slug = @slug,
        description = @description,
        user_query = @user_query,
        repository_path = @repository_path,
        branch = @branch,
        lifecycle = @lifecycle,
        messages = @messages,
        plan = @plan,
        related_artifacts = @related_artifacts,
        agent_run_id = @agent_run_id,
        spec_path = @spec_path,
        mode = @mode,
        iteration_count = @iteration_count,
        max_iterations = @max_iterations,
        push = @push,
        open_pr = @open_pr,
        fork_and_pr = @fork_and_pr,
        commit_specs = @commit_specs,
        ci_watch_enabled = @ci_watch_enabled,
        enable_evidence = @enable_evidence,
        commit_evidence = @commit_evidence,
        auto_merge = @auto_merge,
        allow_prd = @allow_prd,
        allow_plan = @allow_plan,
        allow_merge = @allow_merge,
        worktree_path = @worktree_path,
        repository_id = @repository_id,
        pr_url = @pr_url,
        pr_number = @pr_number,
        pr_status = @pr_status,
        commit_hash = @commit_hash,
        ci_status = @ci_status,
        ci_fix_attempts = @ci_fix_attempts,
        ci_fix_history = @ci_fix_history,
        pr_mergeable = @pr_mergeable,
        upstream_pr_url = @upstream_pr_url,
        upstream_pr_number = @upstream_pr_number,
        upstream_pr_status = @upstream_pr_status,
        parent_id = @parent_id,
        previous_lifecycle = @previous_lifecycle,
        attachments = @attachments,
        inject_skills = @inject_skills,
        injected_skills = @injected_skills,
        deleted_at = @deleted_at,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(row);
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM features WHERE id = ?');
    stmt.run(id);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare('UPDATE features SET deleted_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);
  }
}
