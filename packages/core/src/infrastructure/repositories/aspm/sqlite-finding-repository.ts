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

import {
  CanonicalSeverity,
  FindingState,
  type FindingFilter,
  type SecurityFinding,
} from '../../../domain/generated/output.js';
import type {
  AtRiskApplication,
  FindingUpdateInput,
  IFindingRepository,
  ListFindingsCursor,
  ListFindingsResult,
  ListRankedFindingsResult,
  PostureTrendBucket,
  SeverityCount,
  SlaBreachThreshold,
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

  async findIdByDedupTuple(input: {
    applicationId: string;
    findingDomain: string;
    ruleId: string;
    locationPath?: string;
    locationLine?: number;
    cveId?: string;
  }): Promise<string | null> {
    const path = (input.locationPath ?? '').replace(/\\/g, '/');
    const row = this.db
      .prepare(
        `SELECT id FROM security_findings
         WHERE application_id = ?
           AND finding_domain = ?
           AND rule_id = ?
           AND COALESCE(location_path, '') = ?
           AND COALESCE(location_line, -1) = ?
           AND COALESCE(cve_id, '') = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(
        input.applicationId,
        input.findingDomain,
        input.ruleId,
        path,
        input.locationLine ?? -1,
        input.cveId ?? ''
      ) as { id: string } | undefined;
    return row ? row.id : null;
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

  async listRanked(
    filter: FindingFilter,
    cursor: ListFindingsCursor
  ): Promise<ListRankedFindingsResult> {
    const where = buildFindingWhereClause(filter);
    // Qualify each filter condition against the `f.` alias so the WHERE
    // builder remains alias-agnostic (it emits bare column names).
    const aliasedSql = where.sql.replace(
      /\b(deleted_at|canonical_severity|finding_domain|application_id|owner_id|state|rule_id|cve_id|kev)\b/g,
      'f.$1'
    );

    const rows = this.db
      .prepare(
        `SELECT f.*, rs.total AS risk_score_total
         FROM security_findings f
         LEFT JOIN risk_scores rs ON rs.id = f.current_risk_score_id
         WHERE ${aliasedSql}
         ORDER BY rs.total DESC NULLS LAST, f.discovered_at DESC, f.id ASC
         LIMIT ? OFFSET ?`
      )
      .all(...where.params, cursor.limit, cursor.offset) as (SecurityFindingRow & {
      risk_score_total: number | null;
    })[];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM security_findings f WHERE ${aliasedSql}`)
      .get(...where.params) as { c: number };

    return {
      items: rows.map((row) => ({
        finding: fromDatabase(row),
        riskScoreTotal: row.risk_score_total,
      })),
      total: totalRow.c,
    };
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

  // ──────────────────────────────────────────────────────────────────────
  // Aggregate / posture helpers (task-40 / task-41)
  // ──────────────────────────────────────────────────────────────────────

  async countOpenBySeverity(filter?: FindingFilter): Promise<SeverityCount[]> {
    const where = buildFindingWhereClause(filter ?? {});
    const rows = this.db
      .prepare(
        `SELECT canonical_severity AS severity, COUNT(*) AS c
         FROM security_findings
         WHERE ${where.sql} AND state IN (?, ?, ?)
         GROUP BY canonical_severity`
      )
      .all(...where.params, FindingState.Open, FindingState.Triaged, FindingState.InProgress) as {
      severity: string;
      c: number;
    }[];
    return zeroFillSeverity(
      rows.map((r) => ({ severity: r.severity as CanonicalSeverity, count: r.c }))
    );
  }

  async topAtRiskApplications(limit: number): Promise<AtRiskApplication[]> {
    const rows = this.db
      .prepare(
        `SELECT f.application_id AS application_id,
                COUNT(*) AS open_count,
                COALESCE(SUM(rs.total), 0) AS score_sum
         FROM security_findings f
         LEFT JOIN risk_scores rs ON rs.id = f.current_risk_score_id
         WHERE f.deleted_at IS NULL AND f.state IN (?, ?, ?)
         GROUP BY f.application_id
         ORDER BY score_sum DESC, open_count DESC
         LIMIT ?`
      )
      .all(FindingState.Open, FindingState.Triaged, FindingState.InProgress, limit) as {
      application_id: string;
      open_count: number;
      score_sum: number;
    }[];
    return rows.map((r) => ({
      applicationId: r.application_id,
      openFindingCount: r.open_count,
      riskScoreSum: r.score_sum,
    }));
  }

  async countOpenKev(): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM security_findings
         WHERE deleted_at IS NULL AND kev = 1 AND state IN (?, ?, ?)`
      )
      .get(FindingState.Open, FindingState.Triaged, FindingState.InProgress) as { c: number };
    return row.c;
  }

  async countSlaBreached(
    thresholds: SlaBreachThreshold[],
    now: Date,
    excludeFindingIds: readonly string[] = []
  ): Promise<number> {
    if (thresholds.length === 0) return 0;
    const params: unknown[] = [];
    const branches: string[] = [];
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    for (const t of thresholds) {
      branches.push(`(canonical_severity = ? AND discovered_at <= ?)`);
      params.push(t.severity, now.getTime() - t.windowDays * MS_PER_DAY);
    }
    let sql = `SELECT COUNT(*) AS c
               FROM security_findings
               WHERE deleted_at IS NULL AND state IN (?, ?, ?)
                 AND (${branches.join(' OR ')})`;
    const finalParams: unknown[] = [
      FindingState.Open,
      FindingState.Triaged,
      FindingState.InProgress,
      ...params,
    ];
    if (excludeFindingIds.length > 0) {
      sql += ` AND id NOT IN (${excludeFindingIds.map(() => '?').join(', ')})`;
      finalParams.push(...excludeFindingIds);
    }
    const row = this.db.prepare(sql).get(...finalParams) as { c: number };
    return row.c;
  }

  async latestLastSeenAt(): Promise<Date | null> {
    const row = this.db
      .prepare(`SELECT MAX(last_seen_at) AS m FROM security_findings WHERE deleted_at IS NULL`)
      .get() as { m: number | null };
    return row.m === null ? null : new Date(row.m);
  }

  async countOpenBySeverityForApplication(applicationId: string): Promise<SeverityCount[]> {
    return this.countOpenBySeverity({ applicationIds: [applicationId] });
  }

  async postureTrend(buckets: readonly Date[]): Promise<PostureTrendBucket[]> {
    if (buckets.length === 0) return [];
    const result: PostureTrendBucket[] = [];
    const stmt = this.db.prepare(
      `SELECT canonical_severity AS severity, COUNT(*) AS c
       FROM security_findings
       WHERE deleted_at IS NULL
         AND discovered_at < ?
         AND (first_fixed_at IS NULL OR first_fixed_at >= ?)
       GROUP BY canonical_severity`
    );
    for (const bucketStart of buckets) {
      const ms = bucketStart.getTime();
      const rows = stmt.all(ms, ms) as { severity: string; c: number }[];
      result.push({
        bucketStart,
        countsBySeverity: zeroFillSeverity(
          rows.map((r) => ({ severity: r.severity as CanonicalSeverity, count: r.c }))
        ),
      });
    }
    return result;
  }
}

const ALL_SEVERITIES: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
  CanonicalSeverity.Info,
];

function zeroFillSeverity(rows: SeverityCount[]): SeverityCount[] {
  const byKey = new Map(rows.map((r) => [r.severity, r.count]));
  return ALL_SEVERITIES.map((s) => ({ severity: s, count: byKey.get(s) ?? 0 }));
}
