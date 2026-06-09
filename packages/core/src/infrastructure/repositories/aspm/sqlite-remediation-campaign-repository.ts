/**
 * SQLite RemediationCampaign Repository
 *
 * Feature 098, phase 6 (task-37). Backed by the remediation_campaigns
 * table (migration 113). Status transitions automatically manage
 * closedAt — set on Completed/Cancelled, cleared on Draft/Active/Paused.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import { CampaignStatus, type RemediationCampaign } from '../../../domain/generated/output.js';
import type {
  CampaignAuditEntry,
  IRemediationCampaignRepository,
  RemediationCampaignWithAudit,
} from '../../../application/ports/output/repositories/remediation-campaign-repository.interface.js';
import {
  fromDatabase,
  parseAuditLog,
  toDatabase,
  type RemediationCampaignRow,
} from './mappers/campaign-mapper.js';

const CLOSED_STATUSES: CampaignStatus[] = [CampaignStatus.Completed, CampaignStatus.Cancelled];

@injectable()
export class SQLiteRemediationCampaignRepository implements IRemediationCampaignRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async create(campaign: RemediationCampaign, initialAudit: CampaignAuditEntry): Promise<void> {
    const row = toDatabase(campaign, [initialAudit]);
    this.db
      .prepare(
        `INSERT INTO remediation_campaigns (
           id, name, description, target_query_json, status,
           owner_id, due_date, closed_at, audit_log,
           created_at, updated_at, deleted_at
         ) VALUES (
           @id, @name, @description, @target_query_json, @status,
           @owner_id, @due_date, @closed_at, @audit_log,
           @created_at, @updated_at, @deleted_at
         )`
      )
      .run(row);
  }

  async findById(id: string): Promise<RemediationCampaign | null> {
    const row = this.db
      .prepare('SELECT * FROM remediation_campaigns WHERE id = ? AND deleted_at IS NULL')
      .get(id) as RemediationCampaignRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByIdWithAudit(id: string): Promise<RemediationCampaignWithAudit | null> {
    const row = this.db
      .prepare('SELECT * FROM remediation_campaigns WHERE id = ? AND deleted_at IS NULL')
      .get(id) as RemediationCampaignRow | undefined;
    if (!row) return null;
    return {
      campaign: fromDatabase(row),
      audit: parseAuditLog(row.audit_log),
    };
  }

  async list(
    filters: { statuses?: CampaignStatus[]; ownerId?: string } = {}
  ): Promise<RemediationCampaign[]> {
    const wheres: string[] = ['deleted_at IS NULL'];
    const args: unknown[] = [];

    if (filters.statuses && filters.statuses.length > 0) {
      const placeholders = filters.statuses.map(() => '?').join(', ');
      wheres.push(`status IN (${placeholders})`);
      args.push(...filters.statuses);
    }

    if (filters.ownerId !== undefined) {
      wheres.push('owner_id = ?');
      args.push(filters.ownerId);
    }

    const sql = `SELECT * FROM remediation_campaigns
                 WHERE ${wheres.join(' AND ')}
                 ORDER BY
                   CASE status
                     WHEN '${CampaignStatus.Active}' THEN 0
                     WHEN '${CampaignStatus.Paused}' THEN 1
                     WHEN '${CampaignStatus.Draft}' THEN 2
                     WHEN '${CampaignStatus.Completed}' THEN 3
                     WHEN '${CampaignStatus.Cancelled}' THEN 4
                     ELSE 5
                   END,
                   CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
                   due_date ASC,
                   created_at ASC`;
    const rows = this.db.prepare(sql).all(...args) as RemediationCampaignRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<RemediationCampaign, 'name' | 'description' | 'targetQuery' | 'ownerId' | 'dueDate'>
    >,
    auditEntry: CampaignAuditEntry
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.targetQuery !== undefined) {
      setClauses.push('target_query_json = ?');
      values.push(JSON.stringify(fields.targetQuery));
    }
    if (fields.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(fields.ownerId);
    }
    if (fields.dueDate !== undefined) {
      setClauses.push('due_date = ?');
      values.push(fields.dueDate ? (fields.dueDate as Date).getTime() : null);
    }

    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT audit_log FROM remediation_campaigns WHERE id = ? AND deleted_at IS NULL')
        .get(id) as { audit_log: string } | undefined;
      if (!row) {
        throw new Error(`RemediationCampaign ${id} not found`);
      }
      const audit = parseAuditLog(row.audit_log);
      audit.push(auditEntry);
      setClauses.push('audit_log = ?');
      values.push(JSON.stringify(audit));
      values.push(id);
      this.db
        .prepare(
          `UPDATE remediation_campaigns SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
        )
        .run(...values);
    });
    tx();
  }

  async updateStatus(
    id: string,
    status: CampaignStatus,
    auditEntry: CampaignAuditEntry
  ): Promise<void> {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT audit_log FROM remediation_campaigns WHERE id = ? AND deleted_at IS NULL')
        .get(id) as { audit_log: string } | undefined;
      if (!row) {
        throw new Error(`RemediationCampaign ${id} not found`);
      }
      const audit = parseAuditLog(row.audit_log);
      audit.push(auditEntry);
      const now = Date.now();
      const closedAt = CLOSED_STATUSES.includes(status) ? now : null;
      this.db
        .prepare(
          `UPDATE remediation_campaigns
           SET status = ?, closed_at = ?, audit_log = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(status, closedAt, JSON.stringify(audit), now, id);
    });
    tx();
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    this.db
      .prepare('UPDATE remediation_campaigns SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}
