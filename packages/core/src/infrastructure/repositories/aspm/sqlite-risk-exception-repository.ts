/**
 * SQLite RiskException Repository
 *
 * Feature 098, phase 6 (task-34). Backed by the risk_exceptions table
 * (migration 112). The audit log is JSON-encoded into the `audit_log`
 * column and the repository enforces append-only semantics — callers
 * cannot rewrite history.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import { RiskExceptionStatus, type RiskException } from '../../../domain/generated/output.js';
import type {
  IRiskExceptionRepository,
  RiskExceptionAuditEntry,
  RiskExceptionWithAudit,
} from '../../../application/ports/output/repositories/risk-exception-repository.interface.js';
import {
  fromDatabase,
  parseAuditLog,
  toDatabase,
  type RiskExceptionRow,
} from './mappers/exception-mapper.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@injectable()
export class SQLiteRiskExceptionRepository implements IRiskExceptionRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(exception: RiskException, initialAudit: RiskExceptionAuditEntry): Promise<void> {
    const row = toDatabase(exception, [initialAudit]);
    this.db
      .prepare(
        `INSERT INTO risk_exceptions (
           id, finding_id, reason, justification, declared_by,
           declared_at, expires_at, status, audit_log,
           created_at, updated_at, deleted_at
         ) VALUES (
           @id, @finding_id, @reason, @justification, @declared_by,
           @declared_at, @expires_at, @status, @audit_log,
           @created_at, @updated_at, @deleted_at
         )`
      )
      .run(row);
  }

  async findById(id: string): Promise<RiskException | null> {
    const row = this.db
      .prepare('SELECT * FROM risk_exceptions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as RiskExceptionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByIdWithAudit(id: string): Promise<RiskExceptionWithAudit | null> {
    const row = this.db
      .prepare('SELECT * FROM risk_exceptions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as RiskExceptionRow | undefined;
    if (!row) return null;
    return {
      exception: fromDatabase(row),
      audit: parseAuditLog(row.audit_log),
    };
  }

  async findActiveForFinding(findingId: string): Promise<RiskException | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM risk_exceptions
         WHERE finding_id = ? AND status = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(findingId, RiskExceptionStatus.Active) as RiskExceptionRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByStatus(
    statuses: RiskExceptionStatus[],
    options: { expiringWithinDays?: number; now?: Date } = {}
  ): Promise<RiskException[]> {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    let sql = `SELECT * FROM risk_exceptions WHERE status IN (${placeholders}) AND deleted_at IS NULL`;
    const args: unknown[] = [...statuses];

    if (options.expiringWithinDays !== undefined) {
      const now = (options.now ?? new Date()).getTime();
      const upper = now + options.expiringWithinDays * MS_PER_DAY;
      sql += ' AND expires_at >= ? AND expires_at <= ?';
      args.push(now, upper);
    }

    sql += ' ORDER BY expires_at ASC';
    const rows = this.db.prepare(sql).all(...args) as RiskExceptionRow[];
    return rows.map(fromDatabase);
  }

  async updateStatus(
    id: string,
    status: RiskExceptionStatus,
    auditEntry: RiskExceptionAuditEntry
  ): Promise<void> {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT audit_log FROM risk_exceptions WHERE id = ? AND deleted_at IS NULL')
        .get(id) as { audit_log: string } | undefined;
      if (!row) {
        throw new Error(`RiskException ${id} not found`);
      }
      const audit = parseAuditLog(row.audit_log);
      audit.push(auditEntry);
      const now = Date.now();
      this.db
        .prepare(
          'UPDATE risk_exceptions SET status = ?, audit_log = ?, updated_at = ? WHERE id = ?'
        )
        .run(status, JSON.stringify(audit), now, id);
    });
    tx();
  }

  async appendAuditEntry(id: string, auditEntry: RiskExceptionAuditEntry): Promise<void> {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT audit_log FROM risk_exceptions WHERE id = ? AND deleted_at IS NULL')
        .get(id) as { audit_log: string } | undefined;
      if (!row) {
        throw new Error(`RiskException ${id} not found`);
      }
      const audit = parseAuditLog(row.audit_log);
      audit.push(auditEntry);
      this.db
        .prepare('UPDATE risk_exceptions SET audit_log = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(audit), Date.now(), id);
    });
    tx();
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE risk_exceptions SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
