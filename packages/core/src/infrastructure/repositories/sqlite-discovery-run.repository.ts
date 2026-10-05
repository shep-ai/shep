/** SQLite discovery run repository (spec 128). */

import type Database from 'better-sqlite3';
import type { DiscoveryRun } from '../../domain/generated/output.js';
import type { IDiscoveryRunRepository } from '../../application/ports/output/repositories/discovery-run-repository.interface.js';
import {
  discoveryRunFromDatabase,
  discoveryRunToDatabase,
  type DiscoveryRunRow,
} from '../persistence/sqlite/mappers/discovery-run.mapper.js';

/** Runs a space's history lists unless asked for fewer. */
const DEFAULT_HISTORY = 20;

const COLUMNS = `id, space_id, status, agent_type, signals_read, proposed, dropped, finished_at,
  error, created_at, updated_at`;
const VALUES = `@id, @space_id, @status, @agent_type, @signals_read, @proposed, @dropped,
  @finished_at, @error, @created_at, @updated_at`;

export class SQLiteDiscoveryRunRepository implements IDiscoveryRunRepository {
  constructor(private readonly db: Database.Database) {}

  async listBySpace(spaceId: string, limit = DEFAULT_HISTORY): Promise<DiscoveryRun[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM discovery_runs WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
      )
      .all(spaceId, limit) as DiscoveryRunRow[];
    return rows.map(discoveryRunFromDatabase);
  }

  async latest(spaceId: string): Promise<DiscoveryRun | null> {
    const [run] = await this.listBySpace(spaceId, 1);
    return run ?? null;
  }

  async findById(id: string): Promise<DiscoveryRun | null> {
    const row = this.db.prepare('SELECT * FROM discovery_runs WHERE id = ?').get(id) as
      | DiscoveryRunRow
      | undefined;
    return row ? discoveryRunFromDatabase(row) : null;
  }

  async create(run: DiscoveryRun): Promise<void> {
    this.db
      .prepare(`INSERT INTO discovery_runs (${COLUMNS}) VALUES (${VALUES})`)
      .run(discoveryRunToDatabase(run));
  }

  async update(run: DiscoveryRun): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO discovery_runs (${COLUMNS}) VALUES (${VALUES})`)
      .run(discoveryRunToDatabase(run));
  }
}
