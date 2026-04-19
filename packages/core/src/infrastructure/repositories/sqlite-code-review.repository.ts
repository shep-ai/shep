/**
 * SQLite CodeReview Repository Implementation
 *
 * Implements ICodeReviewRepository using better-sqlite3.
 * Stores review comments as JSON in a TEXT column.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ICodeReviewRepository } from '../../application/ports/output/repositories/code-review-repository.interface.js';
import type { CodeReview } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type CodeReviewRow,
} from '../persistence/sqlite/mappers/code-review.mapper.js';

@injectable()
export class SQLiteCodeReviewRepository implements ICodeReviewRepository {
  constructor(private readonly db: Database.Database) {}

  async create(review: CodeReview): Promise<void> {
    const row = toDatabase(review);
    const stmt = this.db.prepare(`
      INSERT INTO code_reviews (
        id, feature_id, repository_path, pr_number, pr_url,
        status, summary, comments, review_url,
        agent_model, token_usage, error_message,
        created_at, updated_at
      ) VALUES (
        @id, @feature_id, @repository_path, @pr_number, @pr_url,
        @status, @summary, @comments, @review_url,
        @agent_model, @token_usage, @error_message,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async update(review: CodeReview): Promise<void> {
    const row = toDatabase(review);
    const stmt = this.db.prepare(`
      UPDATE code_reviews SET
        feature_id = @feature_id,
        repository_path = @repository_path,
        pr_number = @pr_number,
        pr_url = @pr_url,
        status = @status,
        summary = @summary,
        comments = @comments,
        review_url = @review_url,
        agent_model = @agent_model,
        token_usage = @token_usage,
        error_message = @error_message,
        updated_at = @updated_at
      WHERE id = @id
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<CodeReview | null> {
    const stmt = this.db.prepare('SELECT * FROM code_reviews WHERE id = ?');
    const row = stmt.get(id) as CodeReviewRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByFeatureId(featureId: string): Promise<CodeReview[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM code_reviews WHERE feature_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(featureId) as CodeReviewRow[];
    return rows.map(fromDatabase);
  }

  async findByPrNumber(repositoryPath: string, prNumber: number): Promise<CodeReview[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM code_reviews WHERE repository_path = ? AND pr_number = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(repositoryPath, prNumber) as CodeReviewRow[];
    return rows.map(fromDatabase);
  }

  async list(repositoryPath?: string, options?: { limit?: number }): Promise<CodeReview[]> {
    const limit = options?.limit ?? 50;

    if (repositoryPath) {
      const stmt = this.db.prepare(
        'SELECT * FROM code_reviews WHERE repository_path = ? ORDER BY created_at DESC LIMIT ?'
      );
      const rows = stmt.all(repositoryPath, limit) as CodeReviewRow[];
      return rows.map(fromDatabase);
    }

    const stmt = this.db.prepare('SELECT * FROM code_reviews ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as CodeReviewRow[];
    return rows.map(fromDatabase);
  }
}
