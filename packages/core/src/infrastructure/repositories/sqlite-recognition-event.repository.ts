/**
 * SQLite RecognitionEvent Repository (spec 097, FR-22 / NFR-11).
 *
 * Backed by the `recognition_events` table (migration 102). The `insert`
 * method uses `INSERT … ON CONFLICT DO NOTHING` so that duplicate webhook
 * deliveries cannot double-award the same contributor for the same PR.
 *
 * The `inserted` flag returned by the upsert reflects whether a row was
 * actually written (true) or skipped because the UNIQUE constraint fired
 * (false). Callers use this flag to short-circuit downstream side-effects
 * like `IAllContributorsWriter.appendContributor`.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';
import type {
  IRecognitionEventRepository,
  RecognitionInsertResult,
} from '../../application/ports/output/repositories/recognition-event-repository.interface.js';
import type { RecognitionEvent } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type RecognitionEventRow,
} from '../persistence/sqlite/mappers/recognition-event.mapper.js';

/**
 * Returns the [start, endExclusive) UTC ms boundaries of the given
 * 'YYYY-MM' bucket. Throws if the input is not a valid year-month string.
 */
function monthBoundsUtc(yearMonth: string): { start: number; endExclusive: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    throw new Error(`Invalid yearMonth bucket: '${yearMonth}'. Expected 'YYYY-MM'.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const start = Date.UTC(year, month, 1);
  const endExclusive = Date.UTC(year, month + 1, 1);
  return { start, endExclusive };
}

@injectable()
export class SQLiteRecognitionEventRepository implements IRecognitionEventRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async insert(event: RecognitionEvent): Promise<RecognitionInsertResult> {
    const row = toDatabase(event);
    const result = this.db
      .prepare(
        `INSERT INTO recognition_events
           (id, contributor_id, kind, occurred_at, pr_number, month_recap_id,
            created_at, updated_at)
         VALUES (@id, @contributor_id, @kind, @occurred_at, @pr_number, @month_recap_id,
                 @created_at, @updated_at)
         ON CONFLICT(contributor_id, kind, pr_number) DO NOTHING`
      )
      .run(row);
    return { inserted: result.changes > 0 };
  }

  async findByContributorId(contributorId: string): Promise<RecognitionEvent[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM recognition_events
           WHERE contributor_id = ?
           ORDER BY occurred_at DESC`
      )
      .all(contributorId) as RecognitionEventRow[];
    return rows.map(fromDatabase);
  }

  async findByMonth(yearMonth: string): Promise<RecognitionEvent[]> {
    const { start, endExclusive } = monthBoundsUtc(yearMonth);
    const rows = this.db
      .prepare(
        `SELECT * FROM recognition_events
           WHERE occurred_at >= ? AND occurred_at < ?
           ORDER BY occurred_at ASC`
      )
      .all(start, endExclusive) as RecognitionEventRow[];
    return rows.map(fromDatabase);
  }
}
