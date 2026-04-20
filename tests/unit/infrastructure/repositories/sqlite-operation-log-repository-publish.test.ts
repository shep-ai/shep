/**
 * Unit test — SQLiteOperationLogRepository publishes on append.
 *
 * Real in-memory SQLite (via migration chain so the schema is accurate)
 * + a spy bus. Verifies that publish fires AFTER a successful INSERT,
 * carries the appended entry, and is SKIPPED when the INSERT throws.
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteOperationLogRepository } from '@/infrastructure/repositories/sqlite-operation-log.repository.js';
import type {
  IOperationLogEventBus,
  OperationLogEvent,
} from '@/application/ports/output/services/operation-log-event-bus.interface.js';
import { OperationLogKind, OperationLogLevel } from '@/domain/generated/output.js';

function makeSpyBus(): IOperationLogEventBus & { publish: ReturnType<typeof vi.fn> } {
  const publish = vi.fn();
  const subscribe = vi.fn(() => () => {
    /* unsubscribe no-op for the spy bus */
  });
  return { publish, subscribe } as unknown as IOperationLogEventBus & {
    publish: ReturnType<typeof vi.fn>;
  };
}

describe('SQLiteOperationLogRepository — publish on append', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });

  it('calls bus.publish exactly once with { entry } after a successful append', async () => {
    const bus = makeSpyBus();
    const repo = new SQLiteOperationLogRepository(db, bus);

    const appended = await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'Starting deploy',
    });

    expect(bus.publish).toHaveBeenCalledTimes(1);
    const event = bus.publish.mock.calls[0][0] as OperationLogEvent;
    expect(event).toEqual({ entry: appended });
    expect(event.entry.id).toBe(appended.id);
    expect(event.entry.message).toBe('Starting deploy');
  });

  it('publishes AFTER the row has been inserted — readers see it immediately', async () => {
    const bus = makeSpyBus();
    let rowsVisibleAtPublish: number | null = null;
    bus.publish.mockImplementation(() => {
      rowsVisibleAtPublish = (
        db
          .prepare(
            'SELECT COUNT(*) as c FROM operation_log_entries WHERE operation_kind = ? AND operation_id = ?'
          )
          .get(OperationLogKind.CloudDeploy, 'app-1') as { c: number }
      ).c;
    });

    const repo = new SQLiteOperationLogRepository(db, bus);
    const appended = await repo.append({
      operationKind: OperationLogKind.CloudDeploy,
      operationId: 'app-1',
      level: OperationLogLevel.Info,
      message: 'a',
    });

    expect(rowsVisibleAtPublish).toBe(1);

    const listed = await repo.listByScope(OperationLogKind.CloudDeploy, 'app-1');
    expect(listed.map((e) => e.id)).toEqual([appended.id]);
  });

  it('does NOT publish when the INSERT throws', async () => {
    const bus = makeSpyBus();
    // Swap in a broken DB whose prepare throws synchronously.
    const brokenDb = {
      prepare: () => {
        throw new Error('DB exploded');
      },
    } as unknown as Database.Database;

    const repo = new SQLiteOperationLogRepository(brokenDb, bus);

    await expect(
      repo.append({
        operationKind: OperationLogKind.CloudDeploy,
        operationId: 'app-1',
        level: OperationLogLevel.Info,
        message: 'should fail',
      })
    ).rejects.toThrow('DB exploded');

    expect(bus.publish).not.toHaveBeenCalled();
  });
});
