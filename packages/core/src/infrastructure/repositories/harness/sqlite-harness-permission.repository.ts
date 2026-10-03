/**
 * SQLite implementation of IHarnessPermissionRepository (spec 119).
 *
 * `resolvePending` is a conditional UPDATE on status = 'pending', so two
 * people approving the same request at once cannot both win (spec 116 lesson).
 */
import type Database from 'better-sqlite3';
import {
  PermissionRequestStatus,
  type PermissionDecision,
  type PermissionGrant,
} from '../../../domain/generated/output.js';
import type { IHarnessPermissionRepository } from '../../../application/ports/output/harness/index.js';
import { SqliteDocumentTable, serializeDocument } from './sqlite-document-table.js';

const DEFAULT_PERMISSION_LIMIT = 200;

export class SQLiteHarnessPermissionRepository implements IHarnessPermissionRepository {
  private readonly decisions: SqliteDocumentTable<PermissionDecision>;
  private readonly grants: SqliteDocumentTable<PermissionGrant>;

  constructor(private readonly db: Database.Database) {
    this.decisions = new SqliteDocumentTable<PermissionDecision>(db, {
      table: 'harness_permission_decisions',
      columns: {
        session_id: (d) => d.sessionId,
        task_id: (d) => d.taskId,
        status: (d) => d.status,
      },
    });
    this.grants = new SqliteDocumentTable<PermissionGrant>(db, {
      table: 'harness_permission_grants',
      columns: {
        session_id: (g) => g.sessionId,
        task_id: (g) => g.taskId ?? null,
        consumed: (g) => (g.consumed ? 1 : 0),
      },
    });
  }

  async putPermission(decision: PermissionDecision): Promise<void> {
    this.decisions.upsert(decision);
  }

  async getPermission(id: string): Promise<PermissionDecision | null> {
    return this.decisions.get(id);
  }

  async resolvePending(resolved: PermissionDecision): Promise<boolean> {
    const updatedAt =
      resolved.updatedAt instanceof Date ? resolved.updatedAt.getTime() : Date.now();
    const info = this.db
      .prepare(
        `UPDATE harness_permission_decisions
         SET status = ?, data = ?, updated_at = ?
         WHERE id = ? AND status = ?`
      )
      .run(
        resolved.status,
        serializeDocument(resolved),
        updatedAt,
        resolved.id,
        PermissionRequestStatus.Pending
      );
    return info.changes === 1;
  }

  async listPending(sessionId?: string): Promise<PermissionDecision[]> {
    return sessionId
      ? this.decisions.query(
          'SELECT data FROM harness_permission_decisions WHERE status = ? AND session_id = ? ORDER BY created_at ASC',
          PermissionRequestStatus.Pending,
          sessionId
        )
      : this.decisions.query(
          'SELECT data FROM harness_permission_decisions WHERE status = ? ORDER BY created_at ASC',
          PermissionRequestStatus.Pending
        );
  }

  async listBySession(
    sessionId: string,
    limit = DEFAULT_PERMISSION_LIMIT
  ): Promise<PermissionDecision[]> {
    return this.decisions.query(
      'SELECT data FROM harness_permission_decisions WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
      sessionId,
      limit
    );
  }

  async putGrant(grant: PermissionGrant): Promise<void> {
    this.grants.upsert(grant);
  }

  async listActiveGrants(sessionId: string): Promise<PermissionGrant[]> {
    return this.grants.query(
      'SELECT data FROM harness_permission_grants WHERE session_id = ? AND consumed = 0 ORDER BY created_at ASC',
      sessionId
    );
  }

  async consumeGrant(id: string): Promise<void> {
    const grant = this.grants.get(id);
    if (grant) this.grants.upsert({ ...grant, consumed: true, updatedAt: new Date() });
  }
}
