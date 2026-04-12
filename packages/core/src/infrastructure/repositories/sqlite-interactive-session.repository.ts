/**
 * SQLite Interactive Session Repository Implementation
 *
 * Implements IInteractiveSessionRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IInteractiveSessionRepository } from '../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { InteractiveSession } from '../../domain/generated/output.js';
import { InteractiveSessionStatus } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type InteractiveSessionRow,
} from '../persistence/sqlite/mappers/interactive-session.mapper.js';

@injectable()
export class SQLiteInteractiveSessionRepository implements IInteractiveSessionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(session: InteractiveSession): Promise<void> {
    const row = toDatabase(session);
    this.db
      .prepare(
        `INSERT INTO interactive_sessions
          (id, feature_id, status, started_at, stopped_at, last_activity_at, created_at, updated_at)
         VALUES
          (@id, @feature_id, @status, @started_at, @stopped_at, @last_activity_at, @created_at, @updated_at)`
      )
      .run(row);
  }

  async findById(id: string): Promise<InteractiveSession | null> {
    const row = this.db.prepare('SELECT * FROM interactive_sessions WHERE id = ?').get(id) as
      | InteractiveSessionRow
      | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByFeatureId(featureId: string): Promise<InteractiveSession | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM interactive_sessions WHERE feature_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(featureId) as InteractiveSessionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findAllActive(): Promise<InteractiveSession[]> {
    const rows = this.db
      .prepare(`SELECT * FROM interactive_sessions WHERE status IN ('booting','ready')`)
      .all() as InteractiveSessionRow[];
    return rows.map(fromDatabase);
  }

  async updateStatus(
    id: string,
    status: InteractiveSessionStatus,
    stoppedAt?: Date
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions
         SET status = @status, stopped_at = @stopped_at, updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id,
        status,
        stopped_at: stoppedAt ? stoppedAt.getTime() : null,
        updated_at: Date.now(),
      });
  }

  async updateLastActivity(id: string, lastActivityAt: Date): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions
         SET last_activity_at = @last_activity_at, updated_at = @updated_at
         WHERE id = @id`
      )
      .run({ id, last_activity_at: lastActivityAt.getTime(), updated_at: Date.now() });
  }

  async markAllActiveStopped(): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions
         SET status = 'stopped', updated_at = ?
         WHERE status IN ('booting','ready')`
      )
      .run(Date.now());
  }

  async countActiveSessions(): Promise<number> {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM interactive_sessions WHERE status IN ('booting','ready')`
      )
      .get() as { count: number };
    return result.count;
  }

  async updateAgentSessionId(id: string, agentSessionId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions SET agent_session_id = @agent_session_id, updated_at = @updated_at WHERE id = @id`
      )
      .run({ id, agent_session_id: agentSessionId, updated_at: Date.now() });
  }

  async getAgentSessionId(id: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT agent_session_id FROM interactive_sessions WHERE id = ?')
      .get(id) as { agent_session_id: string | null } | undefined;
    return row?.agent_session_id ?? null;
  }

  async findLatestAgentSessionIdForFeature(featureId: string): Promise<string | null> {
    // Return the most recent NON-NULL agent_session_id for this feature
    // across ALL session rows, regardless of status. Ordering by
    // created_at DESC ensures we pick up the latest successful boot
    // even if an intervening session failed to capture an
    // agentSessionId.
    const row = this.db
      .prepare(
        `SELECT agent_session_id
         FROM interactive_sessions
         WHERE feature_id = ?
           AND agent_session_id IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(featureId) as { agent_session_id: string | null } | undefined;
    return row?.agent_session_id ?? null;
  }

  async updateTurnStatus(id: string, turnStatus: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions SET turn_status = @turn_status, updated_at = @updated_at WHERE id = @id`
      )
      .run({ id, turn_status: turnStatus, updated_at: Date.now() });
  }

  async getTurnStatuses(featureIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (featureIds.length === 0) return result;

    // Use a single query with placeholders for all feature IDs.
    // For each feature, get the most recent session's turn_status.
    const placeholders = featureIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT feature_id, turn_status FROM interactive_sessions
         WHERE feature_id IN (${placeholders})
           AND status IN ('booting','ready')
         ORDER BY created_at DESC`
      )
      .all(...featureIds) as { feature_id: string; turn_status: string }[];

    // First row per feature wins (most recent due to ORDER BY)
    for (const row of rows) {
      if (!result.has(row.feature_id)) {
        result.set(row.feature_id, row.turn_status);
      }
    }
    return result;
  }

  async getAllActiveTurnStatuses(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const rows = this.db
      .prepare(
        `SELECT feature_id, turn_status FROM interactive_sessions
         WHERE status IN ('booting','ready')
           AND turn_status != 'idle'
         ORDER BY created_at DESC`
      )
      .all() as { feature_id: string; turn_status: string }[];

    for (const row of rows) {
      if (!result.has(row.feature_id)) {
        result.set(row.feature_id, row.turn_status);
      }
    }
    return result;
  }

  async accumulateUsage(
    id: string,
    usage: { costUsd: number; inputTokens: number; outputTokens: number; turns: number }
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE interactive_sessions SET
           total_cost_usd = total_cost_usd + @cost_usd,
           total_input_tokens = total_input_tokens + @input_tokens,
           total_output_tokens = total_output_tokens + @output_tokens,
           total_turns = total_turns + @turns,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id,
        cost_usd: usage.costUsd,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        turns: usage.turns,
        updated_at: Date.now(),
      });
  }

  async getUsage(id: string): Promise<{
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTurns: number;
  } | null> {
    const row = this.db
      .prepare(
        'SELECT total_cost_usd, total_input_tokens, total_output_tokens, total_turns FROM interactive_sessions WHERE id = ?'
      )
      .get(id) as
      | {
          total_cost_usd: number;
          total_input_tokens: number;
          total_output_tokens: number;
          total_turns: number;
        }
      | undefined;
    if (!row) return null;
    return {
      totalCostUsd: row.total_cost_usd,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalTurns: row.total_turns,
    };
  }
}
