/**
 * SQLite SecurityPolicy Repository
 *
 * Feature 098, phase 6 (task-32). Backed by the security_policies table
 * (migration 111). Maintains the "at most one active policy" invariant
 * by deactivating any currently-active policy in the same transaction
 * before turning another one on.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import {
  CanonicalSeverity,
  type SecurityPolicy,
  type SLAWindow,
} from '../../../domain/generated/output.js';
import type { ISecurityPolicyRepository } from '../../../application/ports/output/repositories/security-policy-repository.interface.js';
import {
  fromDatabase,
  toDatabase,
  type SecurityPolicyRow,
} from './mappers/security-policy-mapper.js';

const SEVERITY_DAY_COLUMN: Record<CanonicalSeverity, string> = {
  [CanonicalSeverity.Critical]: 'sla_critical_days',
  [CanonicalSeverity.High]: 'sla_high_days',
  [CanonicalSeverity.Medium]: 'sla_medium_days',
  [CanonicalSeverity.Low]: 'sla_low_days',
  // Info findings are excluded from SLA tracking by convention — no column
  // exists for them.
  [CanonicalSeverity.Info]: '',
};

@injectable()
export class SQLiteSecurityPolicyRepository implements ISecurityPolicyRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(policy: SecurityPolicy): Promise<void> {
    const row = toDatabase(policy);
    const insert = this.db.prepare(
      `INSERT INTO security_policies (
         id, name, is_active,
         sla_critical_days, sla_high_days, sla_medium_days, sla_low_days,
         ingestion_max_bytes, created_at, updated_at, deleted_at
       ) VALUES (
         @id, @name, @is_active,
         @sla_critical_days, @sla_high_days, @sla_medium_days, @sla_low_days,
         @ingestion_max_bytes, @created_at, @updated_at, @deleted_at
       )`
    );

    if (row.is_active === 1) {
      const tx = this.db.transaction((r: SecurityPolicyRow) => {
        this.db
          .prepare(
            'UPDATE security_policies SET is_active = 0, updated_at = ? WHERE is_active = 1 AND deleted_at IS NULL'
          )
          .run(Date.now());
        insert.run(r);
      });
      tx(row);
    } else {
      insert.run(row);
    }
  }

  async findById(id: string): Promise<SecurityPolicy | null> {
    const row = this.db
      .prepare('SELECT * FROM security_policies WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SecurityPolicyRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findActive(): Promise<SecurityPolicy | null> {
    const row = this.db
      .prepare('SELECT * FROM security_policies WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1')
      .get() as SecurityPolicyRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listAll(): Promise<SecurityPolicy[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM security_policies WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC'
      )
      .all() as SecurityPolicyRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<SecurityPolicy, 'name' | 'active' | 'slaWindows' | 'maxIngestBytes'>>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }

    if (fields.maxIngestBytes !== undefined) {
      setClauses.push('ingestion_max_bytes = ?');
      values.push(Number(fields.maxIngestBytes));
    }

    if (fields.slaWindows !== undefined) {
      for (const window of fields.slaWindows) {
        const column = SEVERITY_DAY_COLUMN[window.severity];
        if (!column) continue;
        setClauses.push(`${column} = ?`);
        values.push(window.windowDays);
      }
    }

    const shouldActivate = fields.active === true;

    const apply = (): void => {
      if (shouldActivate) {
        this.db
          .prepare(
            'UPDATE security_policies SET is_active = 0, updated_at = ? WHERE is_active = 1 AND deleted_at IS NULL AND id != ?'
          )
          .run(Date.now(), id);
        setClauses.push('is_active = ?');
        values.push(1);
      } else if (fields.active === false) {
        setClauses.push('is_active = ?');
        values.push(0);
      }

      values.push(id);
      this.db
        .prepare(
          `UPDATE security_policies SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
        )
        .run(...values);
    };

    if (shouldActivate) {
      this.db.transaction(apply)();
    } else {
      apply();
    }
  }

  async softDelete(id: string): Promise<void> {
    const active = this.db
      .prepare('SELECT is_active FROM security_policies WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { is_active: number } | undefined;

    if (active?.is_active === 1) {
      throw new Error(
        `Cannot soft-delete the currently active SecurityPolicy ${id} — activate another policy first`
      );
    }

    const now = Date.now();
    this.db
      .prepare('UPDATE security_policies SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}

// Re-exported for test helpers that need to spread a fully-formed slaWindows
// list when assembling test policies.
export const ALL_TRACKED_SLA_SEVERITIES: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
];

// Keep SLAWindow in the import surface so consumers can build test fixtures
// without a separate import line.
export type { SLAWindow };
