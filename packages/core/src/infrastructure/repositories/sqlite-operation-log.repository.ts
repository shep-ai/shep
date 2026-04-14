/**
 * SQLite Operation Log Repository
 *
 * Implements IOperationLogRepository using better-sqlite3. Append-only;
 * scoped reads by (operationKind, operationId).
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { injectable } from 'tsyringe';

import type {
  AppendOperationLogEntryInput,
  IOperationLogRepository,
} from '../../application/ports/output/repositories/operation-log.repository.interface.js';
import type {
  OperationLogEntry,
  OperationLogKind,
  OperationLogLevel,
} from '../../domain/generated/output.js';

interface OperationLogRow {
  id: string;
  operation_kind: string;
  operation_id: string;
  level: string;
  message: string;
  detail: string | null;
  created_at: number;
  updated_at: number;
}

function rowToEntry(row: OperationLogRow): OperationLogEntry {
  return {
    id: row.id,
    operationKind: row.operation_kind as OperationLogKind,
    operationId: row.operation_id,
    level: row.level as OperationLogLevel,
    message: row.message,
    detail: row.detail ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

@injectable()
export class SQLiteOperationLogRepository implements IOperationLogRepository {
  constructor(private readonly db: Database.Database) {}

  async append(input: AppendOperationLogEntryInput): Promise<OperationLogEntry> {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO operation_log_entries (
           id, operation_kind, operation_id, level, message, detail, created_at, updated_at
         ) VALUES (
           @id, @operation_kind, @operation_id, @level, @message, @detail, @created_at, @updated_at
         )`
      )
      .run({
        id,
        operation_kind: input.operationKind,
        operation_id: input.operationId,
        level: input.level,
        message: input.message,
        detail: input.detail ?? null,
        created_at: now,
        updated_at: now,
      });
    return {
      id,
      operationKind: input.operationKind,
      operationId: input.operationId,
      level: input.level,
      message: input.message,
      detail: input.detail,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async listByScope(
    operationKind: OperationLogKind,
    operationId: string
  ): Promise<readonly OperationLogEntry[]> {
    // Tiebreak by SQLite's built-in rowid (monotonic per insert) so entries
    // appended in the same millisecond still read back in insertion order.
    // Random UUID `id` sorts alphabetically, which is NOT insertion order.
    const rows = this.db
      .prepare<[string, string], OperationLogRow>(
        `SELECT id, operation_kind, operation_id, level, message, detail, created_at, updated_at
           FROM operation_log_entries
          WHERE operation_kind = ? AND operation_id = ?
          ORDER BY created_at ASC, rowid ASC`
      )
      .all(operationKind, operationId);
    return rows.map(rowToEntry);
  }

  async pruneBefore(timestamp: number): Promise<number> {
    const result = this.db
      .prepare('DELETE FROM operation_log_entries WHERE created_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
