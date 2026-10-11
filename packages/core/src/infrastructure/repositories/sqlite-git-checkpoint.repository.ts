/**
 * SQLite Git Checkpoint Repository (spec 138)
 *
 * Implements IGitCheckpointRepository over the git_checkpoints table.
 */

import type Database from 'better-sqlite3';
import type { IGitCheckpointRepository } from '../../application/ports/output/repositories/git-checkpoint-repository.interface.js';
import type { GitCheckpoint } from '../../domain/generated/output.js';
import {
  fromDatabase,
  toDatabase,
  type GitCheckpointRow,
} from '../persistence/sqlite/mappers/git-checkpoint.mapper.js';

export class SQLiteGitCheckpointRepository implements IGitCheckpointRepository {
  constructor(private readonly db: Database.Database) {}

  async create(checkpoint: GitCheckpoint): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO git_checkpoints (
          id, feature_id, agent_run_id, sequence, kind, node, ref, commit_sha, tree_sha,
          head_sha, files_changed, additions, deletions, created_at, updated_at
        ) VALUES (
          @id, @feature_id, @agent_run_id, @sequence, @kind, @node, @ref, @commit_sha, @tree_sha,
          @head_sha, @files_changed, @additions, @deletions, @created_at, @updated_at
        )`
      )
      .run(toDatabase(checkpoint));
  }

  async listByFeatureId(featureId: string): Promise<GitCheckpoint[]> {
    const rows = this.db
      .prepare('SELECT * FROM git_checkpoints WHERE feature_id = ? ORDER BY sequence ASC')
      .all(featureId) as GitCheckpointRow[];
    return rows.map(fromDatabase);
  }

  async deleteByFeatureId(featureId: string): Promise<number> {
    return this.db.prepare('DELETE FROM git_checkpoints WHERE feature_id = ?').run(featureId)
      .changes;
  }
}
