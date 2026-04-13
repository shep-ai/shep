import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPmAuditLogRepository } from '../../application/ports/output/repositories/pm-audit-log-repository.interface.js';
import type { PmAuditLog } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PmAuditLogRow,
} from '../persistence/sqlite/mappers/pm-audit-log.mapper.js';

@injectable()
export class SQLitePmAuditLogRepository implements IPmAuditLogRepository {
  constructor(private readonly db: Database.Database) {}

  async create(entry: PmAuditLog): Promise<void> {
    const row = toDatabase(entry);
    const stmt = this.db.prepare(`
      INSERT INTO pm_audit_log (
        id, actor_id, action, target_id, target_type,
        metadata, ip_address, created_at, updated_at
      ) VALUES (
        @id, @actor_id, @action, @target_id, @target_type,
        @metadata, @ip_address, @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async list(filters?: {
    actorId?: string;
    action?: string;
    targetId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<PmAuditLog[]> {
    const { sql, params } = this.buildFilterQuery('SELECT *', filters);
    const limitClause = filters?.limit ? ` LIMIT ${filters.limit}` : ' LIMIT 100';
    const offsetClause = filters?.offset ? ` OFFSET ${filters.offset}` : '';
    const stmt = this.db.prepare(`${sql} ORDER BY created_at DESC${limitClause}${offsetClause}`);
    const rows = stmt.all(...params) as PmAuditLogRow[];
    return rows.map(fromDatabase);
  }

  async count(filters?: {
    actorId?: string;
    action?: string;
    targetId?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<number> {
    const { sql, params } = this.buildFilterQuery('SELECT COUNT(*) as count', filters);
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  private buildFilterQuery(
    selectClause: string,
    filters?: {
      actorId?: string;
      action?: string;
      targetId?: string;
      fromDate?: Date;
      toDate?: Date;
    }
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.actorId) {
      conditions.push('actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters?.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }
    if (filters?.targetId) {
      conditions.push('target_id = ?');
      params.push(filters.targetId);
    }
    if (filters?.fromDate) {
      conditions.push('created_at >= ?');
      params.push(filters.fromDate.getTime());
    }
    if (filters?.toDate) {
      conditions.push('created_at <= ?');
      params.push(filters.toDate.getTime());
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { sql: `${selectClause} FROM pm_audit_log${whereClause}`, params };
  }
}
