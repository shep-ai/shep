/**
 * SqliteHarnessEventLog (spec 119): gap-free sequences across connections,
 * cursor reads, blob offload and durability across a process kill.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import {
  INLINE_PAYLOAD_LIMIT,
  SqliteHarnessEventLog,
} from '@/infrastructure/repositories/harness/sqlite-harness-event-log.js';
import { InMemoryBlobStore } from '@/infrastructure/services/harness/storage/file-system-blob-store.js';
import { HarnessEventType } from '@/domain/generated/output.js';

function openFileDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

describe('SqliteHarnessEventLog', () => {
  let dir: string;
  let dbPath: string;
  let a: Database.Database;
  let b: Database.Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-harness-events-'));
    dbPath = join(dir, 'data.db');
    a = openFileDb(dbPath);
    await runSQLiteMigrations(a);
    b = openFileDb(dbPath);
  });

  afterEach(() => {
    a.close();
    b.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('allocates gap-free sequences across two connections', async () => {
    const blobs = new InMemoryBlobStore();
    const logA = new SqliteHarnessEventLog(a, blobs);
    const logB = new SqliteHarnessEventLog(b, blobs);
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        (i % 2 === 0 ? logA : logB).append({
          sessionId: 's1',
          type: HarnessEventType.ToolSelected,
          payload: { i },
        })
      )
    );
    const events = await logA.listAfter('s1', 0, 1000);
    expect(events.map((e) => e.sequence)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(await logB.lastSequence('s1')).toBe(200);
  });

  it('keeps sequences independent per session and reads strictly after a cursor', async () => {
    const log = new SqliteHarnessEventLog(a, new InMemoryBlobStore());
    for (let i = 0; i < 3; i++) {
      await log.append({ sessionId: 's1', type: HarnessEventType.TaskCreated, payload: {} });
    }
    await log.append({
      sessionId: 's2',
      taskId: 't',
      type: HarnessEventType.TaskCreated,
      payload: {},
    });
    expect((await log.listAfter('s1', 1)).map((e) => e.sequence)).toEqual([2, 3]);
    expect((await log.listAfter('s2', 0))[0]).toMatchObject({ sequence: 1, taskId: 't' });
    expect(await log.listByTask('t')).toHaveLength(1);
  });

  it('offloads large payloads to the blob store', async () => {
    const blobs = new InMemoryBlobStore();
    const log = new SqliteHarnessEventLog(a, blobs);
    const big = { text: 'x'.repeat(INLINE_PAYLOAD_LIMIT + 10) };
    const e = await log.append({
      sessionId: 's',
      type: HarnessEventType.ModelCallCompleted,
      payload: big,
    });
    expect(e.payloadRef).toMatch(/^sha256:/);
    expect(JSON.parse(await blobs.getText(e.payloadRef!))).toEqual(big);
    expect(e.payload).toEqual({ truncated: true, keys: ['text'] });
  });

  it('survives a writer process being killed mid-session', async () => {
    const script = `
      const Database = require('better-sqlite3');
      const db = new Database(${JSON.stringify(dbPath)});
      db.pragma('busy_timeout = 5000');
      const insert = db.prepare("INSERT INTO harness_events (id, session_id, task_id, sequence, type, payload, payload_ref, created_at) VALUES (?, 'kill', NULL, ?, 'task.created', '{}', NULL, ?)");
      for (let i = 1; i <= 25; i++) insert.run('e' + i, i, Date.now());
      process.kill(process.pid, 'SIGKILL');
    `;
    const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(res.signal === 'SIGKILL' || res.status !== 0).toBe(true);
    const reopened = openFileDb(dbPath);
    try {
      const log = new SqliteHarnessEventLog(reopened, new InMemoryBlobStore());
      expect(await log.lastSequence('kill')).toBe(25);
      const next = await log.append({
        sessionId: 'kill',
        type: HarnessEventType.SessionResumed,
        payload: {},
      });
      expect(next.sequence).toBe(26);
    } finally {
      reopened.close();
    }
  });
});
