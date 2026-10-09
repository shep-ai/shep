/** SQLite telemetry outbox (spec 133). Synchronous — see the port. */

import type Database from 'better-sqlite3';
import type { TelemetryEvent } from '../../domain/generated/output.js';
import type {
  EnqueueTelemetryOptions,
  ITelemetryOutboxRepository,
  TelemetryOutboxEntry,
} from '../../application/ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { TelemetryProperties } from '../../application/ports/output/services/telemetry-events.js';

interface TelemetryOutboxRow {
  id: string;
  event: string;
  properties: string;
  captured_at: number;
  attempts: number;
  next_attempt_at: number;
}

function fromRow(row: TelemetryOutboxRow): TelemetryOutboxEntry {
  return {
    id: row.id,
    event: row.event as TelemetryEvent,
    properties: JSON.parse(row.properties) as TelemetryProperties,
    capturedAt: new Date(row.captured_at),
    attempts: row.attempts,
    nextAttemptAt: new Date(row.next_attempt_at),
  };
}

const SELECT_ORDERED = 'SELECT * FROM telemetry_outbox';
const OLDEST_FIRST = 'ORDER BY captured_at ASC, rowid ASC';

export class SQLiteTelemetryOutboxRepository implements ITelemetryOutboxRepository {
  constructor(private readonly db: Database.Database) {}

  enqueue(
    entry: Omit<TelemetryOutboxEntry, 'attempts' | 'nextAttemptAt'>,
    options: EnqueueTelemetryOptions
  ): boolean {
    const capturedAt = entry.capturedAt.getTime();
    return this.db
      .transaction((): boolean => {
        if (options.onceKeyHash !== undefined) {
          const claim = this.db
            .prepare('INSERT OR IGNORE INTO telemetry_once (key_hash, claimed_at) VALUES (?, ?)')
            .run(options.onceKeyHash, capturedAt);
          if (claim.changes === 0) return false;
        }
        this.db
          .prepare(
            `INSERT INTO telemetry_outbox (id, event, properties, captured_at, attempts, next_attempt_at)
           VALUES (?, ?, ?, ?, 0, ?)`
          )
          .run(entry.id, entry.event, JSON.stringify(entry.properties), capturedAt, capturedAt);
        this.db
          .prepare(
            `DELETE FROM telemetry_outbox WHERE id IN (
             SELECT id FROM telemetry_outbox ORDER BY captured_at DESC, rowid DESC LIMIT -1 OFFSET ?
           )`
          )
          .run(options.cap);
        return true;
      })
      .immediate();
  }

  claimDue(now: Date, limit: number, leaseUntil: Date): TelemetryOutboxEntry[] {
    const lease = this.db.prepare(
      'UPDATE telemetry_outbox SET next_attempt_at = ? WHERE id = ? AND next_attempt_at <= ?'
    );
    return this.db
      .transaction((): TelemetryOutboxEntry[] => {
        const rows = this.db
          .prepare(`${SELECT_ORDERED} WHERE next_attempt_at <= ? ${OLDEST_FIRST} LIMIT ?`)
          .all(now.getTime(), limit) as TelemetryOutboxRow[];
        return rows
          .filter((row) => lease.run(leaseUntil.getTime(), row.id, now.getTime()).changes === 1)
          .map((row) => fromRow({ ...row, next_attempt_at: leaseUntil.getTime() }));
      })
      .immediate();
  }

  list(limit: number): TelemetryOutboxEntry[] {
    const rows = this.db
      .prepare(`${SELECT_ORDERED} ${OLDEST_FIRST} LIMIT ?`)
      .all(limit) as TelemetryOutboxRow[];
    return rows.map(fromRow);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM telemetry_outbox').get() as { n: number }).n;
  }

  remove(ids: readonly string[]): void {
    const statement = this.db.prepare('DELETE FROM telemetry_outbox WHERE id = ?');
    this.db.transaction(() => ids.forEach((id) => statement.run(id)))();
  }

  recordFailure(ids: readonly string[], nextAttemptAt: Date): void {
    const statement = this.db.prepare(
      'UPDATE telemetry_outbox SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?'
    );
    const at = nextAttemptAt.getTime();
    this.db.transaction(() => ids.forEach((id) => statement.run(at, id)))();
  }

  clear(): void {
    this.db.prepare('DELETE FROM telemetry_outbox').run();
  }
}
