/**
 * SQLiteAgentMessageBus — integration tests (spec 093, task 11).
 *
 * Verifies cross-process delivery, scope isolation (NFR-7), and the
 * publish/subscribe contract end-to-end against a real SQLite database.
 *
 * Cross-process delivery is exercised by opening two separate
 * better-sqlite3 connections to the same file: one bus instance writes,
 * the other observes via listFor. This mirrors the parallel-worktree
 * scenario the bus exists to support.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentMessageRepository } from '@/infrastructure/repositories/sqlite-agent-message.repository.js';
import { SQLiteAgentMessageBus } from '@/infrastructure/services/agents/agent-message-bus/sqlite-agent-message-bus.js';
import { PeerAddressingForbiddenError } from '@/domain/errors/peer-addressing-forbidden.error.js';
import type { AgentMessage } from '@/domain/generated/output.js';
import { AgentMessageKind } from '@/domain/generated/output.js';

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  const now = new Date();
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2, 9)}`,
    appId: 'app-1',
    featureId: undefined,
    fromAgentRunId: 'run-1',
    fromActor: 'agent:run-1',
    toTarget: 'broadcast',
    toKind: 'broadcast',
    messageKind: AgentMessageKind.status,
    payload: '{}',
    correlationId: undefined,
    deliveredAt: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentMessage;
}

describe('SQLiteAgentMessageBus', () => {
  let dbDir: string;
  let dbPath: string;
  let writerDb: Database.Database;
  let readerDb: Database.Database;
  let writerBus: SQLiteAgentMessageBus;
  let readerBus: SQLiteAgentMessageBus;

  // Run migrations once per file. The shep schema is now ~80 migrations,
  // and re-running them in beforeEach pushed the Windows CI runner past
  // the 20s hookTimeout. Each test gets fresh connections + a clean
  // agent_message table instead.
  beforeAll(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'shep-bus-it-'));
    dbPath = join(dbDir, 'shep.db');

    const setupDb = new Database(dbPath);
    setupDb.pragma('journal_mode = WAL');
    setupDb.pragma('foreign_keys = ON');
    await runSQLiteMigrations(setupDb);
    setupDb.close();
  });

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    writerDb = new Database(dbPath);
    writerDb.pragma('foreign_keys = ON');

    readerDb = new Database(dbPath);
    readerDb.pragma('foreign_keys = ON');

    writerDb.exec('DELETE FROM agent_messages');

    const writerRepo = new SQLiteAgentMessageRepository(writerDb);
    const readerRepo = new SQLiteAgentMessageRepository(readerDb);

    writerBus = new SQLiteAgentMessageBus(writerRepo);
    readerBus = new SQLiteAgentMessageBus(readerRepo);
    readerBus.setPollIntervalMs(50);
  });

  afterEach(() => {
    readerBus.shutdown();
    writerBus.shutdown();
    writerDb.close();
    readerDb.close();
  });

  it('publish + listFor across two connections (cross-process round-trip)', async () => {
    await writerBus.publish(makeMessage({ id: 'm1', appId: 'app-1' }));
    const rows = await readerBus.listFor({ appId: 'app-1' });
    expect(rows.map((r) => r.id)).toContain('m1');
  });

  it('rejects peer addressing with the typed error', async () => {
    const peerMsg = makeMessage({ toKind: 'peer', toTarget: 'run-2' });
    await expect(writerBus.publish(peerMsg)).rejects.toBeInstanceOf(PeerAddressingForbiddenError);
  });

  it('marks delivered_at after a subscribe loop reads the message', async () => {
    const handler = vi.fn();
    readerBus.subscribe({ appId: 'app-1' }, handler);

    await writerBus.publish(makeMessage({ id: 'm-deliver', appId: 'app-1' }));

    // Wait long enough for one poll tick.
    await new Promise((r) => setTimeout(r, 200));

    expect(handler).toHaveBeenCalled();
    const stored = await readerBus.listFor({ appId: 'app-1' });
    const target = stored.find((r) => r.id === 'm-deliver');
    expect(target?.deliveredAt).toBeTruthy();
  });

  it('cross-app subscribers do not observe other-app messages (NFR-7)', async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    readerBus.subscribe({ appId: 'app-1' }, handlerA);
    readerBus.subscribe({ appId: 'app-2' }, handlerB);

    await writerBus.publish(makeMessage({ id: 'cross-1', appId: 'app-1' }));

    await new Promise((r) => setTimeout(r, 200));

    expect(handlerA).toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });
});
