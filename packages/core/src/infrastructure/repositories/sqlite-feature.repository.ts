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
  CountByLifecyclesOptions,
  FeatureListFilters,
  FeatureStartClaim,
} from '../../application/ports/output/repositories/feature-repository.interface.js';
import type { AgentRunStatus, Feature, SdlcLifecycle } from '../../domain/generated/output.js';
import { UNLIMITED_PARALLEL_FEATURES } from '../../domain/shared/parallel-feature-limit.js';
import { normalizeRepositoryPath } from '../../domain/shared/repository-path.js';
import {
  toDatabase,
  fromDatabase,
  type FeatureRow,
} from '../persistence/sqlite/mappers/feature.mapper.js';

/**
 * A scalar sub-select counting the features that occupy a parallel slot.
 *
 * The ONE definition of "occupies a slot", shared by the read-model count and
 * by the claim that authorises a start — so the number the user is shown and
 * the number the claim enforces cannot drift. A feature counts when its
 * lifecycle is a running one, it is not soft-deleted, and its current agent
 * run (if one is recorded) has not finished. Placeholders come from the array
 * lengths; the values themselves are always bound into `params`.
 */
function occupiedSlotCountSql(
  runningLifecycles: readonly SdlcLifecycle[],
  releasingRunStatuses: readonly AgentRunStatus[] | undefined,
  params: Record<string, unknown>
): string {
  const lifecyclePlaceholders = runningLifecycles
    .map((lifecycle, i) => {
      params[`slot_lifecycle_${i}`] = lifecycle;
      return `@slot_lifecycle_${i}`;
    })
    .join(', ');

  let releasedByRun = '';
  if (releasingRunStatuses && releasingRunStatuses.length > 0) {
    const statusPlaceholders = releasingRunStatuses
      .map((status, i) => {
        params[`slot_released_${i}`] = status;
        return `@slot_released_${i}`;
      })
      .join(', ');
    releasedByRun = `
             AND NOT EXISTS (SELECT 1 FROM agent_runs AS run
                              WHERE run.id = occupied.agent_run_id
                                AND run.status IN (${statusPlaceholders}))`;
  }

  return `(SELECT COUNT(*) FROM features AS occupied
           WHERE occupied.lifecycle IN (${lifecyclePlaceholders})
             AND occupied.deleted_at IS NULL${releasedByRun})`;
}

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
        application_id, build_mode, fast,
        push, open_pr, fork_and_pr, commit_specs,
        ci_watch_enabled, enable_evidence, commit_evidence,
        auto_merge, allow_prd, allow_plan, allow_merge,
        worktree_path, repository_id,
        pr_url, pr_number, pr_status, commit_hash, ci_status,
        ci_fix_attempts, ci_fix_history, pr_mergeable,
        upstream_pr_url, upstream_pr_number, upstream_pr_status,
        parent_id, previous_lifecycle, attachments,
        inject_skills, injected_skills, bedrock_enabled,
        active_plugins,
        source_agent_session_id, source_agent_type,
        iteration_count, max_iterations,
        queued_at,
        deleted_at, created_at, updated_at
      ) VALUES (
        @id, @name, @slug, @description, @user_query, @repository_path, @branch,
        @lifecycle, @messages, @plan, @related_artifacts,
        @agent_run_id, @spec_path,
        @application_id, @build_mode, @fast,
        @push, @open_pr, @fork_and_pr, @commit_specs,
        @ci_watch_enabled, @enable_evidence, @commit_evidence,
        @auto_merge, @allow_prd, @allow_plan, @allow_merge,
        @worktree_path, @repository_id,
        @pr_url, @pr_number, @pr_status, @commit_hash, @ci_status,
        @ci_fix_attempts, @ci_fix_history, @pr_mergeable,
        @upstream_pr_url, @upstream_pr_number, @upstream_pr_status,
        @parent_id, @previous_lifecycle, @attachments,
        @inject_skills, @injected_skills, @bedrock_enabled,
        @active_plugins,
        @source_agent_session_id, @source_agent_type,
        @iteration_count, @max_iterations,
        @queued_at,
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
    // The column is compared directly rather than through REPLACE(): paths are
    // normalised on write (and back-filled by migration 144), and wrapping an
    // indexed column in a function makes its index unusable — here it left the
    // repository_path half of idx_features_slug doing nothing.
    const stmt = this.db.prepare(
      'SELECT * FROM features WHERE slug = ? AND repository_path = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(slug, normalizeRepositoryPath(repositoryPath)) as FeatureRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByBranch(branch: string, repositoryPath: string): Promise<Feature | null> {
    // Served by idx_features_branch_repo (migration 144). Before that index —
    // and while repository_path was wrapped in REPLACE() — this query had no
    // usable index at all and visited every live feature.
    const stmt = this.db.prepare(
      'SELECT * FROM features WHERE branch = ? AND repository_path = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(branch, normalizeRepositoryPath(repositoryPath)) as FeatureRow | undefined;

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
      conditions.push('repository_path = ?');
      params.push(normalizeRepositoryPath(filters.repositoryPath));
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

  async countByLifecycles(
    lifecycles: SdlcLifecycle[],
    options?: CountByLifecyclesOptions
  ): Promise<number> {
    if (lifecycles.length === 0) {
      return 0;
    }

    const params: Record<string, unknown> = {};
    const stmt = this.db.prepare(
      `SELECT ${occupiedSlotCountSql(lifecycles, options?.releasingRunStatuses, params)} AS count`
    );
    const row = stmt.get(params) as { count: number };
    return row.count;
  }

  async listQueued(): Promise<Feature[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM features WHERE queued_at IS NOT NULL AND deleted_at IS NULL ORDER BY queued_at ASC'
    );
    const rows = stmt.all() as FeatureRow[];
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
        application_id = @application_id,
        build_mode = @build_mode,
        fast = @fast,
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
        bedrock_enabled = @bedrock_enabled,
        active_plugins = @active_plugins,
        source_agent_session_id = @source_agent_session_id,
        source_agent_type = @source_agent_type,
        iteration_count = @iteration_count,
        max_iterations = @max_iterations,
        queued_at = @queued_at,
        deleted_at = @deleted_at,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(row);
  }

  async claimForStart(claim: FeatureStartClaim): Promise<boolean> {
    // Every guard is a WHERE condition rather than an `if` around the update,
    // so the check and the write are the same statement and no other process
    // can slip between them.
    const conditions = ['id = @id', 'deleted_at IS NULL'];
    const params: Record<string, unknown> = {
      id: claim.featureId,
      lifecycle: claim.targetLifecycle,
      updated_at: claim.updatedAt.getTime(),
    };

    if (claim.requireQueued === true) {
      conditions.push('queued_at IS NOT NULL');
    }

    if (claim.requireLifecycle !== undefined) {
      conditions.push('lifecycle = @expected_lifecycle');
      params.expected_lifecycle = claim.requireLifecycle;
    }

    if (claim.requireAgentRunId !== undefined) {
      conditions.push('agent_run_id = @expected_agent_run_id');
      params.expected_agent_run_id = claim.requireAgentRunId;
    }

    const assignments = ['queued_at = NULL', 'lifecycle = @lifecycle', 'updated_at = @updated_at'];
    if (claim.agentRunId !== undefined) {
      assignments.push('agent_run_id = @agent_run_id');
      params.agent_run_id = claim.agentRunId;
    }

    const capacity = claim.capacity;
    // No cap, an unlimited cap, or nothing that can occupy a slot: the claim
    // carries no capacity condition at all. (An empty lifecycle list would
    // also emit `IN ()`, which is a syntax error — and would mean nothing is
    // running, so the cap could not be reached anyway.)
    if (
      capacity !== undefined &&
      capacity.limit !== UNLIMITED_PARALLEL_FEATURES &&
      capacity.runningLifecycles.length > 0
    ) {
      conditions.push(
        `${occupiedSlotCountSql(capacity.runningLifecycles, capacity.releasingRunStatuses, params)} < @limit`
      );
      params.limit = capacity.limit;
    }

    const stmt = this.db.prepare(`
      UPDATE features SET ${assignments.join(', ')}
      WHERE ${conditions.join(' AND ')}
    `);

    return stmt.run(params).changes === 1;
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
