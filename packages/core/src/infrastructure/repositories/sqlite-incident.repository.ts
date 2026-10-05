/** SQLite incident, timeline and runtime action repositories (spec 129). */

import type Database from 'better-sqlite3';
import {
  IncidentStatus,
  type Incident,
  type IncidentEvent,
  type RuntimeAction,
} from '../../domain/generated/output.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
  IRuntimeActionRepository,
  IncidentFilter,
} from '../../application/ports/output/repositories/incident-repository.interface.js';
import {
  incidentEventFromDatabase,
  incidentEventToDatabase,
  incidentFromDatabase,
  incidentToDatabase,
  runtimeActionFromDatabase,
  runtimeActionToDatabase,
  type IncidentEventRow,
  type IncidentRow,
  type RuntimeActionRow,
} from '../persistence/sqlite/mappers/incident.mapper.js';

const INCIDENT_COLUMNS = `id, space_id, title, severity, status, source, detail, url, external_id,
  runtime_context, runtime_namespace, runtime_workload, signal_id, mitigated_at, resolved_at,
  postmortem, created_at, updated_at`;
const INCIDENT_VALUES = `@id, @space_id, @title, @severity, @status, @source, @detail, @url,
  @external_id, @runtime_context, @runtime_namespace, @runtime_workload, @signal_id,
  @mitigated_at, @resolved_at, @postmortem, @created_at, @updated_at`;

export class SQLiteIncidentRepository implements IIncidentRepository {
  constructor(private readonly db: Database.Database) {}

  async list(filter: IncidentFilter = {}): Promise<Incident[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.spaceId !== undefined) {
      where.push('space_id = ?');
      params.push(filter.spaceId);
    }
    if (filter.statuses !== undefined) {
      if (filter.statuses.length === 0) return [];
      where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
      params.push(...filter.statuses);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM incidents ${clause} ORDER BY created_at DESC, id DESC`)
      .all(...params) as IncidentRow[];
    return rows.map(incidentFromDatabase);
  }

  async findById(id: string): Promise<Incident | null> {
    const row = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as
      | IncidentRow
      | undefined;
    return row ? incidentFromDatabase(row) : null;
  }

  async findOpenByExternalId(spaceId: string, externalId: string): Promise<Incident | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM incidents WHERE space_id = ? AND external_id = ? AND status != ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(spaceId, externalId, IncidentStatus.Resolved) as IncidentRow | undefined;
    return row ? incidentFromDatabase(row) : null;
  }

  async create(incident: Incident): Promise<void> {
    this.db
      .prepare(`INSERT INTO incidents (${INCIDENT_COLUMNS}) VALUES (${INCIDENT_VALUES})`)
      .run(incidentToDatabase(incident));
  }

  async update(incident: Incident): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO incidents (${INCIDENT_COLUMNS}) VALUES (${INCIDENT_VALUES})`)
      .run(incidentToDatabase(incident));
  }
}

export class SQLiteIncidentEventRepository implements IIncidentEventRepository {
  constructor(private readonly db: Database.Database) {}

  async listByIncident(incidentId: string): Promise<IncidentEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at, rowid')
      .all(incidentId) as IncidentEventRow[];
    return rows.map(incidentEventFromDatabase);
  }

  async append(event: IncidentEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO incident_events (id, incident_id, kind, text, created_at)
         VALUES (@id, @incident_id, @kind, @text, @created_at)`
      )
      .run(incidentEventToDatabase(event));
  }
}

const ACTION_COLUMNS = `id, incident_id, kind, replicas, status, proposed_by, reason, output,
  recovered, decided_at, executed_at, created_at, updated_at`;
const ACTION_VALUES = `@id, @incident_id, @kind, @replicas, @status, @proposed_by, @reason,
  @output, @recovered, @decided_at, @executed_at, @created_at, @updated_at`;

export class SQLiteRuntimeActionRepository implements IRuntimeActionRepository {
  constructor(private readonly db: Database.Database) {}

  async listByIncident(incidentId: string): Promise<RuntimeAction[]> {
    const rows = this.db
      .prepare('SELECT * FROM runtime_actions WHERE incident_id = ? ORDER BY created_at, id')
      .all(incidentId) as RuntimeActionRow[];
    return rows.map(runtimeActionFromDatabase);
  }

  async findById(id: string): Promise<RuntimeAction | null> {
    const row = this.db.prepare('SELECT * FROM runtime_actions WHERE id = ?').get(id) as
      | RuntimeActionRow
      | undefined;
    return row ? runtimeActionFromDatabase(row) : null;
  }

  async create(action: RuntimeAction): Promise<void> {
    this.db
      .prepare(`INSERT INTO runtime_actions (${ACTION_COLUMNS}) VALUES (${ACTION_VALUES})`)
      .run(runtimeActionToDatabase(action));
  }

  async update(action: RuntimeAction): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO runtime_actions (${ACTION_COLUMNS}) VALUES (${ACTION_VALUES})`
      )
      .run(runtimeActionToDatabase(action));
  }
}
