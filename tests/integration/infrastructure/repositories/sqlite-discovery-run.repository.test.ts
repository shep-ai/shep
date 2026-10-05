/** Discovery runs (spec 128): migration 161 and every field through the repository. */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/161-create-discovery.js';
import { SQLiteDiscoveryRunRepository } from '@/infrastructure/repositories/sqlite-discovery-run.repository.js';
import { AgentType, DiscoveryRunStatus, type DiscoveryRun } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-01T10:05:00Z');

const RUN: DiscoveryRun = {
  id: 'run-1',
  spaceId: 'space-acme',
  status: DiscoveryRunStatus.Failed,
  agentType: AgentType.ClaudeCode,
  signalsRead: 12,
  proposed: 0,
  dropped: 2,
  finishedAt: T2,
  error: 'Agent timed out',
  createdAt: T1,
  updatedAt: T2,
};

describe('SQLiteDiscoveryRunRepository', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips every field and lists a space newest first', async () => {
    const runs = new SQLiteDiscoveryRunRepository(db);
    await runs.create(RUN);
    const running: DiscoveryRun = {
      id: 'run-2',
      spaceId: 'space-acme',
      status: DiscoveryRunStatus.Running,
      signalsRead: 3,
      proposed: 0,
      dropped: 0,
      createdAt: T2,
      updatedAt: T2,
    };
    await runs.create(running);
    await runs.create({ ...running, id: 'run-3', spaceId: 'space-me' });

    expect(await runs.findById('run-1')).toEqual(RUN);
    expect((await runs.listBySpace('space-acme')).map((r) => r.id)).toEqual(['run-2', 'run-1']);
    expect((await runs.latest('space-acme'))?.id).toBe('run-2');
    expect(await runs.latest('space-none')).toBeNull();

    await runs.update({
      ...running,
      status: DiscoveryRunStatus.Succeeded,
      proposed: 2,
      finishedAt: T2,
    });
    expect((await runs.findById('run-2'))?.status).toBe(DiscoveryRunStatus.Succeeded);
  });
});
