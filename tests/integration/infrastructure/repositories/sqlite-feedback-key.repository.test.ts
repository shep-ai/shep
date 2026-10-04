/**
 * Feedback keys and signal external ids (spec 127): migration 160, every key
 * field through both column lists, lookup by hash, and one signal per
 * external id in a space.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/160-create-feedback-keys.js';
import { SQLiteFeedbackKeyRepository } from '@/infrastructure/repositories/sqlite-feedback-key.repository.js';
import { SQLiteSignalRepository } from '@/infrastructure/repositories/sqlite-opportunity.repository.js';
import { SignalKind, type FeedbackKey, type Signal } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const KEY: FeedbackKey = {
  id: 'key-1',
  spaceId: 'space-acme',
  name: 'Zendesk',
  prefix: 'shep_fb_abcd',
  keyHash: 'a'.repeat(64),
  lastUsedAt: T2,
  revokedAt: T2,
  createdAt: T1,
  updatedAt: T2,
};

function signal(id: string, spaceId: string, externalId?: string): Signal {
  return {
    id,
    spaceId,
    kind: SignalKind.Feedback,
    title: id,
    urgent: false,
    ...(externalId ? { externalId } : {}),
    createdAt: T1,
    updatedAt: T1,
  };
}

describe('SQLite feedback keys and signal external ids', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips every key field and finds a key by its hash', async () => {
    const keys = new SQLiteFeedbackKeyRepository(db);
    await keys.create(KEY);
    const bare: FeedbackKey = {
      id: 'key-2',
      spaceId: 'space-me',
      name: 'Script',
      prefix: 'shep_fb_efgh',
      keyHash: 'b'.repeat(64),
      createdAt: T2,
      updatedAt: T2,
    };
    await keys.create(bare);
    expect(await keys.findById('key-1')).toEqual(KEY);
    expect(await keys.findByHash('b'.repeat(64))).toEqual(bare);
    expect(await keys.findByHash('c'.repeat(64))).toBeNull();
    expect((await keys.list('space-acme')).map((k) => k.id)).toEqual(['key-1']);
    expect((await keys.list()).map((k) => k.id)).toEqual(['key-1', 'key-2']);
    await keys.update({ ...bare, lastUsedAt: T1 });
    expect((await keys.findById('key-2'))?.lastUsedAt).toEqual(T1);
  });

  it('keeps one signal per external id in a space', async () => {
    const signals = new SQLiteSignalRepository(db);
    await signals.create(signal('s1', 'space-acme', 'ticket-9'));
    await signals.create(signal('s2', 'space-me', 'ticket-9'));
    await signals.create(signal('s3', 'space-acme'));
    await signals.create(signal('s4', 'space-acme'));
    expect((await signals.findByExternalId('space-acme', 'ticket-9'))?.id).toBe('s1');
    expect(await signals.findByExternalId('space-acme', 'ticket-0')).toBeNull();
    expect((await signals.findById('s1'))?.externalId).toBe('ticket-9');
    await expect(signals.create(signal('s5', 'space-acme', 'ticket-9'))).rejects.toThrow();
  });
});
