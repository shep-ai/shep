/** SQLite PR comment and round repositories (spec 124). */

import type Database from 'better-sqlite3';
import type { PrComment, PrCommentKind, PrCommentRound } from '../../domain/generated/output.js';
import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '../../application/ports/output/repositories/pr-comment-repository.interface.js';
import {
  prCommentFromDatabase,
  prCommentRoundFromDatabase,
  prCommentRoundToDatabase,
  prCommentToDatabase,
  type PrCommentRoundRow,
  type PrCommentRow,
} from '../persistence/sqlite/mappers/pr-comment.mapper.js';

export class SQLitePrCommentRepository implements IPrCommentRepository {
  constructor(private readonly db: Database.Database) {}

  async listByFeature(featureId: string): Promise<PrComment[]> {
    const rows = this.db
      .prepare('SELECT * FROM pr_comments WHERE feature_id = ? ORDER BY written_at ASC, id ASC')
      .all(featureId) as PrCommentRow[];
    return rows.map(prCommentFromDatabase);
  }

  async findByGithubId(
    featureId: string,
    kind: PrCommentKind,
    githubId: string
  ): Promise<PrComment | null> {
    const row = this.db
      .prepare('SELECT * FROM pr_comments WHERE feature_id = ? AND kind = ? AND github_id = ?')
      .get(featureId, kind, githubId) as PrCommentRow | undefined;
    return row ? prCommentFromDatabase(row) : null;
  }

  async create(comment: PrComment): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pr_comments (id, feature_id, github_id, kind, author, body, path, line,
           diff_hunk, thread_id, url, written_at, status, reply, reply_url, round_id, error,
           created_at, updated_at)
         VALUES (@id, @feature_id, @github_id, @kind, @author, @body, @path, @line, @diff_hunk,
           @thread_id, @url, @written_at, @status, @reply, @reply_url, @round_id, @error,
           @created_at, @updated_at)`
      )
      .run(prCommentToDatabase(comment));
  }

  async update(comment: PrComment): Promise<void> {
    this.db
      .prepare(
        `UPDATE pr_comments SET feature_id = @feature_id, github_id = @github_id, kind = @kind,
           author = @author, body = @body, path = @path, line = @line, diff_hunk = @diff_hunk,
           thread_id = @thread_id, url = @url, written_at = @written_at, status = @status,
           reply = @reply, reply_url = @reply_url, round_id = @round_id, error = @error,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run(prCommentToDatabase(comment));
  }
}

export class SQLitePrCommentRoundRepository implements IPrCommentRoundRepository {
  constructor(private readonly db: Database.Database) {}

  async findById(id: string): Promise<PrCommentRound | null> {
    const row = this.db.prepare('SELECT * FROM pr_comment_rounds WHERE id = ?').get(id) as
      | PrCommentRoundRow
      | undefined;
    return row ? prCommentRoundFromDatabase(row) : null;
  }

  async listByFeature(featureId: string): Promise<PrCommentRound[]> {
    const rows = this.db
      .prepare('SELECT * FROM pr_comment_rounds WHERE feature_id = ? ORDER BY created_at DESC')
      .all(featureId) as PrCommentRoundRow[];
    return rows.map(prCommentRoundFromDatabase);
  }

  async create(round: PrCommentRound): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pr_comment_rounds (id, feature_id, comment_ids, status, agent_type,
           commit_sha, summary, error, finished_at, created_at, updated_at)
         VALUES (@id, @feature_id, @comment_ids, @status, @agent_type, @commit_sha, @summary,
           @error, @finished_at, @created_at, @updated_at)`
      )
      .run(prCommentRoundToDatabase(round));
  }

  async update(round: PrCommentRound): Promise<void> {
    this.db
      .prepare(
        `UPDATE pr_comment_rounds SET feature_id = @feature_id, comment_ids = @comment_ids,
           status = @status, agent_type = @agent_type, commit_sha = @commit_sha,
           summary = @summary, error = @error, finished_at = @finished_at,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run(prCommentRoundToDatabase(round));
  }
}
