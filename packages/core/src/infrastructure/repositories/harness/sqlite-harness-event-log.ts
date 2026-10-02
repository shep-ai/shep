/**
 * SQLite implementation of IHarnessEventLog (spec 119).
 *
 * Sequence allocation happens inside an IMMEDIATE transaction, so two
 * connections (the feature worker and the web daemon) appending to the same
 * session can never collide or leave a gap. Payloads larger than
 * INLINE_PAYLOAD_LIMIT go to the blob store; the row keeps a small summary.
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { HarnessEvent } from '../../../domain/generated/output.js';
import type {
  HarnessEventInput,
  IBlobStore,
  IHarnessEventLog,
} from '../../../application/ports/output/harness/index.js';

/** Payloads above this many bytes are stored in the blob store. */
export const INLINE_PAYLOAD_LIMIT = 4096;

const DEFAULT_PAGE = 500;

interface EventRow {
  id: string;
  session_id: string;
  task_id: string | null;
  sequence: number;
  type: string;
  payload: string;
  payload_ref: string | null;
  created_at: number;
}

function fromRow(row: EventRow): HarnessEvent {
  const createdAt = new Date(row.created_at);
  return {
    id: row.id,
    sessionId: row.session_id,
    ...(row.task_id !== null && { taskId: row.task_id }),
    sequence: row.sequence,
    type: row.type as HarnessEvent['type'],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    ...(row.payload_ref !== null && { payloadRef: row.payload_ref }),
    createdAt,
    updatedAt: createdAt,
  };
}

export class SqliteHarnessEventLog implements IHarnessEventLog {
  constructor(
    private readonly db: Database.Database,
    private readonly blobs: IBlobStore
  ) {}

  async append(event: HarnessEventInput): Promise<HarnessEvent> {
    const serialized = JSON.stringify(event.payload);
    let payload = serialized;
    let payloadRef: string | null = null;
    if (Buffer.byteLength(serialized, 'utf8') > INLINE_PAYLOAD_LIMIT) {
      payloadRef = await this.blobs.put(serialized);
      payload = JSON.stringify({ truncated: true, keys: Object.keys(event.payload) });
    }
    const row: EventRow = {
      id: randomUUID(),
      session_id: event.sessionId,
      task_id: event.taskId ?? null,
      sequence: 0,
      type: event.type,
      payload,
      payload_ref: payloadRef,
      created_at: Date.now(),
    };
    const insert = this.db.transaction(() => {
      const { next } = this.db
        .prepare(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM harness_events WHERE session_id = ?'
        )
        .get(event.sessionId) as { next: number };
      row.sequence = next;
      this.db
        .prepare(
          `INSERT INTO harness_events (id, session_id, task_id, sequence, type, payload, payload_ref, created_at)
           VALUES (@id, @session_id, @task_id, @sequence, @type, @payload, @payload_ref, @created_at)`
        )
        .run(row);
    });
    insert.immediate();
    return fromRow(row);
  }

  async listAfter(
    sessionId: string,
    afterSequence: number,
    limit = DEFAULT_PAGE
  ): Promise<HarnessEvent[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM harness_events WHERE session_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?'
      )
      .all(sessionId, afterSequence, limit) as EventRow[];
    return rows.map(fromRow);
  }

  async listByTask(taskId: string): Promise<HarnessEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM harness_events WHERE task_id = ? ORDER BY sequence ASC')
      .all(taskId) as EventRow[];
    return rows.map(fromRow);
  }

  async lastSequence(sessionId: string): Promise<number> {
    const { last } = this.db
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS last FROM harness_events WHERE session_id = ?')
      .get(sessionId) as { last: number };
    return last;
  }
}
