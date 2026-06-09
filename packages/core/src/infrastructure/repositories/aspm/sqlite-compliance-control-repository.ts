/**
 * SQLite ComplianceControl Repository
 *
 * Feature 098, phase 9 (Compliance Surface) / task-52. Backed by
 * compliance_controls + finding_compliance_controls (migration 115).
 *
 * `linkManyToFinding` runs the INSERT OR IGNORE batch inside a single
 * better-sqlite3 transaction (NFR-6) so a SARIF ingestion that links
 * many controls per finding stays atomic.
 *
 * `getCoverageForFramework` computes per-control open-finding counts via
 * SQL so the compliance view stays under the NFR-7 paint budget on
 * realistic datasets.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';

import {
  type ComplianceControl,
  type ComplianceFramework,
  FindingState,
} from '../../../domain/generated/output.js';
import type {
  ComplianceCoverageRow,
  IComplianceControlRepository,
} from '../../../application/ports/output/repositories/compliance-control-repository.interface.js';
import { fromDatabase, type ComplianceControlRow } from './mappers/compliance-control-mapper.js';

@injectable()
export class SQLiteComplianceControlRepository implements IComplianceControlRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async findById(id: string): Promise<ComplianceControl | null> {
    const row = this.db
      .prepare('SELECT * FROM compliance_controls WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ComplianceControlRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByFramework(frameworkId: ComplianceFramework): Promise<ComplianceControl[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM compliance_controls
         WHERE framework_id = ? AND deleted_at IS NULL
         ORDER BY control_id ASC`
      )
      .all(frameworkId) as ComplianceControlRow[];
    return rows.map(fromDatabase);
  }

  async findIdByControlIdentifier(
    frameworkId: ComplianceFramework,
    controlIdentifier: string
  ): Promise<string | null> {
    const row = this.db
      .prepare(
        `SELECT id FROM compliance_controls
         WHERE framework_id = ? AND control_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(frameworkId, controlIdentifier) as { id: string } | undefined;
    return row ? row.id : null;
  }

  async linkToFinding(findingId: string, controlId: string): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO finding_compliance_controls
         (id, finding_id, control_id, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(randomUUID(), findingId, controlId, Date.now());
  }

  async linkManyToFinding(findingId: string, controlIds: readonly string[]): Promise<void> {
    if (controlIds.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO finding_compliance_controls
       (id, finding_id, control_id, created_at)
       VALUES (?, ?, ?, ?)`
    );
    const now = Date.now();
    const tx = this.db.transaction((ids: readonly string[]) => {
      for (const controlId of ids) {
        stmt.run(randomUUID(), findingId, controlId, now);
      }
    });
    tx(controlIds);
  }

  async findControlsForFinding(findingId: string): Promise<ComplianceControl[]> {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM compliance_controls c
         JOIN finding_compliance_controls j ON j.control_id = c.id
         WHERE j.finding_id = ? AND c.deleted_at IS NULL
         ORDER BY c.framework_id ASC, c.control_id ASC`
      )
      .all(findingId) as ComplianceControlRow[];
    return rows.map(fromDatabase);
  }

  async getCoverageForFramework(
    frameworkId: ComplianceFramework
  ): Promise<ComplianceCoverageRow[]> {
    const rows = this.db
      .prepare(
        `SELECT c.id           AS control_id,
                c.control_id   AS control_identifier,
                c.title        AS title,
                COUNT(CASE WHEN f.id IS NOT NULL THEN 1 END) AS open_count
           FROM compliance_controls c
           LEFT JOIN finding_compliance_controls j ON j.control_id = c.id
           LEFT JOIN security_findings f
             ON f.id = j.finding_id
            AND f.deleted_at IS NULL
            AND f.state IN (?, ?, ?)
          WHERE c.framework_id = ? AND c.deleted_at IS NULL
          GROUP BY c.id, c.control_id, c.title
          ORDER BY c.control_id ASC`
      )
      .all(FindingState.Open, FindingState.Triaged, FindingState.InProgress, frameworkId) as {
      control_id: string;
      control_identifier: string;
      title: string;
      open_count: number;
    }[];

    return rows.map((r) => ({
      controlId: r.control_id,
      controlIdentifier: r.control_identifier,
      title: r.title,
      openFindingCount: r.open_count,
    }));
  }
}
