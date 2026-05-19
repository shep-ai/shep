/**
 * SQLite SecurityFinding Repository
 *
 * Feature 098, phase 3. Backed by the security_findings table
 * (migration 108). The repository is the only persistence boundary —
 * all use cases reach this class via the `IFindingRepository` port and
 * tsyringe injection.
 *
 * Ingestion uses {@link bulkInsertOrIgnore} which wraps the batch in a
 * single better-sqlite3 transaction (NFR-6) and relies on the partial
 * unique index `idx_security_findings_dedup_unique` to no-op duplicates.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';

import type { FindingFilter, SecurityFinding } from '../../../domain/generated/output.js';
import type {
  FindingUpdateInput,
  IFindingRepository,
  ListFindingsCursor,
  ListFindingsResult,
} from '../../../application/ports/output/repositories/finding-repository.interface.js';
import { buildFindingWhereClause } from './finding-filter-sql.js';
import { fromDatabase, toDatabase, type SecurityFindingRow } from './mappers/finding-mapper.js';

const INSERT_SQL = `INSERT INTO security_findings (
  id, workspace_id, application_id, service_id, api_asset_id, cloud_environment_id,
  finding_domain, rule_id, title, description, location_path, location_line,
  scanner_raw, scanner_raw_hash, raw_severity, canonical_severity,
  cve_id, cwe_id, owasp_asvs_control_id, kev, epss_percentile, owner_id, state,
  current_risk_score_id, work_item_id, source,
  discovered_at, last_seen_at, first_fixed_at, created_at, updated_at, deleted_at
) VALUES (
  @id, @workspace_id, @application_id, @service_id, @api_asset_id, @cloud_environment_id,
  @finding_domain, @rule_id, @title, @description, @location_path, @location_line,
  @scanner_raw, @scanner_raw_hash, @raw_severity, @canonical_severity,
  @cve_id, @cwe_id, @owasp_asvs_control_id, @kev, @epss_percentile, @owner_id, @state,
  @current_risk_score_id, @work_item_id, @source,
  @discovered_at, @last_seen_at, @first_fixed_at, @created_at, @updated_at, @deleted_at
)`;

const INSERT_OR_IGNORE_SQL = INSERT_SQL.replace(/^INSERT INTO/, 'INSERT OR IGNORE INTO');

@injectable()
export class SQLiteFindingRepository implements IFindingRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(finding: SecurityFinding): Promise<void> {
    const row = toDatabase(finding);
    this.db.prepare(INSERT_SQL).run(row);
  }

  async bulkInsertOrIgnore(
    findings: SecurityFinding[]
  ): Promise<{ inserted: number; duplicates: number }> {
    if (findings.length === 0) return { inserted: 0, duplicates: 0 };

    const stmt = this.db.prepare(INSERT_OR_IGNORE_SQL);
    let inserted = 0;
    let duplicates = 0;

    const tx = this.db.transaction((rows: SecurityFindingRow[]) => {
      for (const row of rows) {
        const result = stmt.run(row);
        if (result.changes === 1) {
          inserted += 1;
        } else {
          duplicates += 1;
        }
      }
    });

    tx(findings.map(toDatabase));
    return { inserted, duplicates };
  }

  async findById(id: string): Promise<SecurityFinding | null> {
    const row = this.db
      .prepare('SELECT * FROM security_findings WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SecurityFindingRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(filter: FindingFilter, cursor: ListFindingsCursor): Promise<ListFindingsResult> {
    const where = buildFindingWhereClause(filter);
    const rows = this.db
      .prepare(
        `SELECT * FROM security_findings WHERE ${where.sql}
         ORDER BY discovered_at DESC, id ASC
         LIMIT ? OFFSET ?`
      )
      .all(...where.params, cursor.limit, cursor.offset) as SecurityFindingRow[];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM security_findings WHERE ${where.sql}`)
      .get(...where.params) as { c: number };

    return { items: rows.map(fromDatabase), total: totalRow.c };
  }

  async count(filter: FindingFilter): Promise<number> {
    const where = buildFindingWhereClause(filter);
    const row = this.db
      .prepare(`SELECT COUNT(*) as c FROM security_findings WHERE ${where.sql}`)
      .get(...where.params) as { c: number };
    return row.c;
  }

  async update(id: string, fields: FindingUpdateInput): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.state !== undefined) {
      setClauses.push('state = ?');
      values.push(fields.state);
    }
    if (fields.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(fields.ownerId);
    }
    if (fields.currentRiskScoreId !== undefined) {
      setClauses.push('current_risk_score_id = ?');
      values.push(fields.currentRiskScoreId);
    }
    if (fields.workItemId !== undefined) {
      setClauses.push('work_item_id = ?');
      values.push(fields.workItemId);
    }
    if (fields.lastSeenAt !== undefined) {
      setClauses.push('last_seen_at = ?');
      values.push(fields.lastSeenAt.getTime());
    }
    if (fields.firstFixedAt !== undefined) {
      setClauses.push('first_fixed_at = ?');
      values.push(fields.firstFixedAt.getTime());
    }

    values.push(id);
    this.db
      .prepare(
        `UPDATE security_findings SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
      )
      .run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE security_findings SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
