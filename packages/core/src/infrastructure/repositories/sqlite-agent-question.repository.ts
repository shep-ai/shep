/**
 * SQLite AgentQuestion Repository (spec 093)
 *
 * Backed by the agent_questions table (migration 088). Every read is
 * scoped by app_id at the SQL layer (NFR-7).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  AgentQuestionListFilters,
  IAgentQuestionRepository,
} from '../../application/ports/output/repositories/agent-question-repository.interface.js';
import type { AgentQuestion, AgentQuestionStatus } from '../../domain/generated/output.js';
import { AgentQuestionStatus as AgentQuestionStatusEnum } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type AgentQuestionRow,
} from '../persistence/sqlite/mappers/agent-question.mapper.js';

@injectable()
export class SQLiteAgentQuestionRepository implements IAgentQuestionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(question: AgentQuestion): Promise<void> {
    const row = toDatabase(question);
    const stmt = this.db.prepare(`
      INSERT INTO agent_questions (
        id, app_id, feature_id, agent_run_id, kind, prompt,
        options_json, default_answer, answerer, status,
        answer, answered_by, answered_at, expires_at,
        created_at, updated_at
      ) VALUES (
        @id, @app_id, @feature_id, @agent_run_id, @kind, @prompt,
        @options_json, @default_answer, @answerer, @status,
        @answer, @answered_by, @answered_at, @expires_at,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async findById(appId: string, id: string): Promise<AgentQuestion | null> {
    const stmt = this.db.prepare('SELECT * FROM agent_questions WHERE id = ? AND app_id = ?');
    const row = stmt.get(id, appId) as AgentQuestionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByScope(
    appId: string,
    featureId: string | undefined,
    filters: AgentQuestionListFilters = {}
  ): Promise<AgentQuestion[]> {
    const conditions: string[] = ['app_id = ?'];
    const params: unknown[] = [appId];

    if (featureId !== undefined) {
      conditions.push('feature_id = ?');
      params.push(featureId);
    }
    if (filters.status !== undefined) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const limitClause = filters.limit !== undefined ? ' LIMIT ?' : '';
    if (filters.limit !== undefined) {
      params.push(filters.limit);
    }

    const sql = `SELECT * FROM agent_questions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC${limitClause}`;
    const rows = this.db.prepare(sql).all(...params) as AgentQuestionRow[];
    return rows.map(fromDatabase);
  }

  async listByAgentRun(appId: string, agentRunId: string): Promise<AgentQuestion[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM agent_questions WHERE app_id = ? AND agent_run_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(appId, agentRunId) as AgentQuestionRow[];
    return rows.map(fromDatabase);
  }

  async updateStatus(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>> = {}
  ): Promise<void> {
    this.writeStatus(appId, id, status, fields, false);
  }

  async settlePending(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>> = {}
  ): Promise<boolean> {
    return this.writeStatus(appId, id, status, fields, true);
  }

  /** One UPDATE; with `onlyIfPending` the pending check is in its WHERE clause. */
  private writeStatus(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>>,
    onlyIfPending: boolean
  ): boolean {
    const now = Date.now();
    const setClauses: string[] = ['status = ?', 'updated_at = ?'];
    const values: unknown[] = [status, now];

    if (fields.answer !== undefined) {
      setClauses.push('answer = ?');
      values.push(fields.answer);
    }
    if (fields.answeredBy !== undefined) {
      setClauses.push('answered_by = ?');
      values.push(fields.answeredBy);
    }
    if (fields.answeredAt !== undefined) {
      setClauses.push('answered_at = ?');
      values.push(
        fields.answeredAt instanceof Date ? fields.answeredAt.getTime() : Number(fields.answeredAt)
      );
    }

    values.push(id, appId);
    let where = 'id = ? AND app_id = ?';
    if (onlyIfPending) {
      where += ' AND status = ?';
      values.push(AgentQuestionStatusEnum.pending);
    }
    const stmt = this.db.prepare(
      `UPDATE agent_questions SET ${setClauses.join(', ')} WHERE ${where}`
    );
    return stmt.run(...values).changes > 0;
  }

  async findExpired(cutoff: Date, limit?: number): Promise<AgentQuestion[]> {
    const limitClause = limit !== undefined ? ' LIMIT ?' : '';
    const params: unknown[] = [AgentQuestionStatusEnum.pending, cutoff.getTime()];
    if (limit !== undefined) params.push(limit);

    const sql = `SELECT * FROM agent_questions WHERE status = ? AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at ASC${limitClause}`;
    const rows = this.db.prepare(sql).all(...params) as AgentQuestionRow[];
    return rows.map(fromDatabase);
  }
}
