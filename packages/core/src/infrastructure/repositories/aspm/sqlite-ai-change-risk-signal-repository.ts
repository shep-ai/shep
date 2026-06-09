/**
 * SQLite AiChangeRiskSignal Repository
 *
 * Feature 098, phase 8 (task-49). Backed by the ai_change_risk_signals
 * table (migration 114). Powers the `/aspm/ai-review` queue and feeds
 * the dashboard "AI review queue" tile.
 *
 * State transitions (Open → Acknowledged → Graduated/Dismissed/Resolved)
 * are wrapped in transactions so `state`, `resolved_at`, and
 * `graduated_finding_id` move atomically. Graduation sets the back-link
 * to the new SecurityFinding (FR-31); dismissal records the justification
 * in the evidence payload before this repository sees it (FR-32).
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import { AiSignalState, type AiChangeRiskSignal } from '../../../domain/generated/output.js';
import type {
  AiSignalListFilter,
  IAiChangeRiskSignalRepository,
} from '../../../application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import {
  fromDatabase,
  toDatabase,
  type AiChangeRiskSignalRow,
} from './mappers/ai-signal-mapper.js';

const OPEN_STATES: AiSignalState[] = [AiSignalState.Open, AiSignalState.Acknowledged];
const TERMINAL_STATES: AiSignalState[] = [
  AiSignalState.GraduatedToFinding,
  AiSignalState.Dismissed,
  AiSignalState.Resolved,
];
const DEFAULT_LIST_LIMIT = 50;

@injectable()
export class SQLiteAiChangeRiskSignalRepository implements IAiChangeRiskSignalRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async countOpen(): Promise<number> {
    const placeholders = OPEN_STATES.map(() => '?').join(', ');
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM ai_change_risk_signals
         WHERE state IN (${placeholders}) AND deleted_at IS NULL`
      )
      .get(...OPEN_STATES) as { n: number };
    return row.n;
  }

  async create(signal: AiChangeRiskSignal): Promise<void> {
    const row = toDatabase(signal);
    this.db
      .prepare(
        `INSERT INTO ai_change_risk_signals (
           id, application_id, agent_session_id, signal_type, severity,
           summary, evidence, state, owner_id, graduated_finding_id,
           discovered_at, resolved_at, created_at, updated_at, deleted_at
         ) VALUES (
           @id, @application_id, @agent_session_id, @signal_type, @severity,
           @summary, @evidence, @state, @owner_id, @graduated_finding_id,
           @discovered_at, @resolved_at, @created_at, @updated_at, @deleted_at
         )`
      )
      .run(row);
  }

  async findById(id: string): Promise<AiChangeRiskSignal | null> {
    const row = this.db
      .prepare('SELECT * FROM ai_change_risk_signals WHERE id = ? AND deleted_at IS NULL')
      .get(id) as AiChangeRiskSignalRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(filter: AiSignalListFilter = {}): Promise<AiChangeRiskSignal[]> {
    const wheres: string[] = ['deleted_at IS NULL'];
    const args: unknown[] = [];

    const states = filter.states ?? OPEN_STATES;
    if (states.length > 0) {
      const placeholders = states.map(() => '?').join(', ');
      wheres.push(`state IN (${placeholders})`);
      args.push(...states);
    }

    if (filter.applicationId !== undefined) {
      wheres.push('application_id = ?');
      args.push(filter.applicationId);
    }

    if (filter.agentSessionId !== undefined) {
      wheres.push('agent_session_id = ?');
      args.push(filter.agentSessionId);
    }

    if (filter.signalTypes && filter.signalTypes.length > 0) {
      const placeholders = filter.signalTypes.map(() => '?').join(', ');
      wheres.push(`signal_type IN (${placeholders})`);
      args.push(...filter.signalTypes);
    }

    const limit = filter.limit ?? DEFAULT_LIST_LIMIT;
    const offset = filter.offset ?? 0;

    const sql = `SELECT * FROM ai_change_risk_signals
                 WHERE ${wheres.join(' AND ')}
                 ORDER BY discovered_at DESC, id ASC
                 LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const rows = this.db.prepare(sql).all(...args) as AiChangeRiskSignalRow[];
    return rows.map(fromDatabase);
  }

  async markGraduated(id: string, graduatedFindingId: string, now: Date): Promise<void> {
    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE ai_change_risk_signals
           SET state = ?,
               graduated_finding_id = ?,
               resolved_at = ?,
               updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          AiSignalState.GraduatedToFinding,
          graduatedFindingId,
          now.getTime(),
          now.getTime(),
          id
        );
      if (result.changes === 0) {
        throw new Error(`AiChangeRiskSignal ${id} not found`);
      }
    });
    tx();
  }

  async markDismissed(id: string, evidence: string | undefined, now: Date): Promise<void> {
    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE ai_change_risk_signals
           SET state = ?, evidence = ?, resolved_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(AiSignalState.Dismissed, evidence ?? null, now.getTime(), now.getTime(), id);
      if (result.changes === 0) {
        throw new Error(`AiChangeRiskSignal ${id} not found`);
      }
    });
    tx();
  }

  async updateState(id: string, state: AiSignalState, now: Date): Promise<void> {
    const tx = this.db.transaction(() => {
      const resolvedAt = TERMINAL_STATES.includes(state) ? now.getTime() : null;
      const result = this.db
        .prepare(
          `UPDATE ai_change_risk_signals
           SET state = ?, resolved_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(state, resolvedAt, now.getTime(), id);
      if (result.changes === 0) {
        throw new Error(`AiChangeRiskSignal ${id} not found`);
      }
    });
    tx();
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE ai_change_risk_signals SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
