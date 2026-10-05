/** SQLite signal, opportunity and weights repositories (spec 126). */

import type Database from 'better-sqlite3';
import type { Opportunity, OpportunityWeights, Signal } from '../../domain/generated/output.js';
import type {
  IOpportunityRepository,
  IOpportunityWeightsRepository,
  ISignalRepository,
  OpportunityFilter,
  SignalFilter,
} from '../../application/ports/output/repositories/opportunity-repository.interface.js';
import {
  opportunityFromDatabase,
  opportunityToDatabase,
  signalFromDatabase,
  signalToDatabase,
  weightsFromDatabase,
  weightsToDatabase,
  type OpportunityRow,
  type OpportunityWeightsRow,
  type SignalRow,
} from '../persistence/sqlite/mappers/opportunity.mapper.js';

const SIGNAL_COLUMNS = `id, space_id, product_line_id, kind, title, detail, customer,
  monthly_revenue, urgent, url, opportunity_id, external_id, created_at, updated_at`;
const SIGNAL_VALUES = `@id, @space_id, @product_line_id, @kind, @title, @detail, @customer,
  @monthly_revenue, @urgent, @url, @opportunity_id, @external_id, @created_at, @updated_at`;

export class SQLiteSignalRepository implements ISignalRepository {
  constructor(private readonly db: Database.Database) {}

  async list(filter: SignalFilter = {}): Promise<Signal[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.spaceId !== undefined) {
      where.push('space_id = ?');
      params.push(filter.spaceId);
    }
    if (filter.opportunityId !== undefined) {
      where.push('opportunity_id = ?');
      params.push(filter.opportunityId);
    }
    if (filter.unlinked) where.push('opportunity_id IS NULL');
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM signals ${clause} ORDER BY created_at DESC, id`)
      .all(...params) as SignalRow[];
    return rows.map(signalFromDatabase);
  }

  async findById(id: string): Promise<Signal | null> {
    const row = this.db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as
      | SignalRow
      | undefined;
    return row ? signalFromDatabase(row) : null;
  }

  async findByExternalId(spaceId: string, externalId: string): Promise<Signal | null> {
    const row = this.db
      .prepare('SELECT * FROM signals WHERE space_id = ? AND external_id = ?')
      .get(spaceId, externalId) as SignalRow | undefined;
    return row ? signalFromDatabase(row) : null;
  }

  async create(signal: Signal): Promise<void> {
    this.db
      .prepare(`INSERT INTO signals (${SIGNAL_COLUMNS}) VALUES (${SIGNAL_VALUES})`)
      .run(signalToDatabase(signal));
  }

  async update(signal: Signal): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO signals (${SIGNAL_COLUMNS}) VALUES (${SIGNAL_VALUES})`)
      .run(signalToDatabase(signal));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM signals WHERE id = ?').run(id);
  }
}

const OPPORTUNITY_COLUMNS = `id, space_id, product_line_id, title, problem, status, review_hours,
  confidence, strategic, work_item_id, decided_at, drop_reason, source, brief, created_at,
  updated_at`;
const OPPORTUNITY_VALUES = `@id, @space_id, @product_line_id, @title, @problem, @status,
  @review_hours, @confidence, @strategic, @work_item_id, @decided_at, @drop_reason, @source,
  @brief, @created_at, @updated_at`;

export class SQLiteOpportunityRepository implements IOpportunityRepository {
  constructor(private readonly db: Database.Database) {}

  async list(filter: OpportunityFilter = {}): Promise<Opportunity[]> {
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
      .prepare(`SELECT * FROM opportunities ${clause} ORDER BY created_at ASC, id`)
      .all(...params) as OpportunityRow[];
    return rows.map(opportunityFromDatabase);
  }

  async findById(id: string): Promise<Opportunity | null> {
    const row = this.db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as
      | OpportunityRow
      | undefined;
    return row ? opportunityFromDatabase(row) : null;
  }

  async create(opportunity: Opportunity): Promise<void> {
    this.db
      .prepare(`INSERT INTO opportunities (${OPPORTUNITY_COLUMNS}) VALUES (${OPPORTUNITY_VALUES})`)
      .run(opportunityToDatabase(opportunity));
  }

  async update(opportunity: Opportunity): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO opportunities (${OPPORTUNITY_COLUMNS})
         VALUES (${OPPORTUNITY_VALUES})`
      )
      .run(opportunityToDatabase(opportunity));
  }
}

export class SQLiteOpportunityWeightsRepository implements IOpportunityWeightsRepository {
  constructor(private readonly db: Database.Database) {}

  async find(spaceId: string): Promise<OpportunityWeights | null> {
    const row = this.db
      .prepare('SELECT * FROM opportunity_weights WHERE space_id = ?')
      .get(spaceId) as OpportunityWeightsRow | undefined;
    return row ? weightsFromDatabase(row) : null;
  }

  async listScheduled(): Promise<OpportunityWeights[]> {
    const rows = this.db
      .prepare('SELECT * FROM opportunity_weights WHERE discovery_every_hours IS NOT NULL')
      .all() as OpportunityWeightsRow[];
    return rows.map(weightsFromDatabase);
  }

  async save(weights: OpportunityWeights): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO opportunity_weights (space_id, reach, revenue, urgency, strategic,
           weekly_review_hours, discovery_every_hours)
         VALUES (@space_id, @reach, @revenue, @urgency, @strategic, @weekly_review_hours,
           @discovery_every_hours)`
      )
      .run(weightsToDatabase(weights));
  }
}
