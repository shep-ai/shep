/**
 * SQLite WhatsApp Thread Mapping Repository Integration Tests (spec 101)
 *
 * Verifies the thread↔target binding persists correctly: upsert/re-bind,
 * lookup by thread, lookup of the active mapping by target, and deactivation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteWhatsAppThreadMappingRepository } from '@/infrastructure/repositories/sqlite-whatsapp-thread-mapping.repository.js';
import { WhatsAppThreadTargetKind } from '@/domain/generated/output.js';

describe('SQLiteWhatsAppThreadMappingRepository', () => {
  let db: Database.Database;
  let repo: SQLiteWhatsAppThreadMappingRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteWhatsAppThreadMappingRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('upserts a new mapping and reads it back by thread', async () => {
    const stored = await repo.upsert({
      threadId: '972500000000@s.whatsapp.net',
      targetKind: WhatsAppThreadTargetKind.Feature,
      targetId: 'feat-abc',
    });

    expect(stored.threadId).toBe('972500000000@s.whatsapp.net');
    expect(stored.targetKind).toBe(WhatsAppThreadTargetKind.Feature);
    expect(stored.targetId).toBe('feat-abc');
    expect(stored.active).toBe(true);
    expect(stored.createdAt).toBeGreaterThan(0);

    const loaded = await repo.findByThread('972500000000@s.whatsapp.net');
    expect(loaded).toEqual(stored);
  });

  it('returns null for an unknown thread', async () => {
    expect(await repo.findByThread('nope@s.whatsapp.net')).toBeNull();
  });

  it('re-binds an existing thread to a new target and reactivates it', async () => {
    await repo.upsert({
      threadId: 't1',
      targetKind: WhatsAppThreadTargetKind.Feature,
      targetId: 'feat-1',
    });
    await repo.deactivate('t1');

    const rebound = await repo.upsert({
      threadId: 't1',
      targetKind: WhatsAppThreadTargetKind.Application,
      targetId: 'app-9',
    });

    expect(rebound.targetKind).toBe(WhatsAppThreadTargetKind.Application);
    expect(rebound.targetId).toBe('app-9');
    expect(rebound.active).toBe(true);
  });

  it('finds the active mapping by target, ignoring deactivated ones', async () => {
    await repo.upsert({
      threadId: 'old-thread',
      targetKind: WhatsAppThreadTargetKind.Application,
      targetId: 'app-1',
    });
    await repo.deactivate('old-thread');

    await repo.upsert({
      threadId: 'new-thread',
      targetKind: WhatsAppThreadTargetKind.Application,
      targetId: 'app-1',
    });

    const found = await repo.findActiveByTarget(WhatsAppThreadTargetKind.Application, 'app-1');
    expect(found?.threadId).toBe('new-thread');
  });

  it('returns null from findActiveByTarget when all mappings are inactive', async () => {
    await repo.upsert({
      threadId: 't',
      targetKind: WhatsAppThreadTargetKind.Feature,
      targetId: 'feat-x',
    });
    await repo.deactivate('t');

    expect(await repo.findActiveByTarget(WhatsAppThreadTargetKind.Feature, 'feat-x')).toBeNull();
  });

  it('deactivate is a no-op for an unknown thread', async () => {
    await expect(repo.deactivate('ghost')).resolves.toBeUndefined();
  });
});
