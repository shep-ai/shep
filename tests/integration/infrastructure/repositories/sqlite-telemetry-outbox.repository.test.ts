/**
 * Telemetry outbox (spec 133): migration 166, once-key claims, due ordering,
 * failure bookkeeping, the size cap, and the settings telemetry columns.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/166-create-telemetry.js';
import { SQLiteTelemetryOutboxRepository } from '@/infrastructure/repositories/sqlite-telemetry-outbox.repository.js';
import { SQLiteSettingsRepository } from '@/infrastructure/repositories/sqlite-settings.repository.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { TelemetryEvent } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-01T10:05:00Z');
const T3 = new Date('2026-10-01T10:10:00Z');
const CAP = 1_000;

function entry(id: string, capturedAt: Date) {
  return {
    id,
    event: TelemetryEvent.CliCommand,
    properties: { command: 'feat new', flags: ['a', 'b'], count: 2, ok: true },
    capturedAt,
  };
}

describe('SQLiteTelemetryOutboxRepository', () => {
  let db: Database.Database;
  let outbox: SQLiteTelemetryOutboxRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    outbox = new SQLiteTelemetryOutboxRepository(db);
  });

  afterEach(() => db.close());

  it('migration 166 is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips an entry with its properties, fresh attempts and an immediately due time', () => {
    expect(outbox.enqueue(entry('e1', T1), { cap: CAP })).toBe(true);
    expect(outbox.list(10)).toEqual([{ ...entry('e1', T1), attempts: 0, nextAttemptAt: T1 }]);
    expect(outbox.count()).toBe(1);
  });

  it('queues an event once per once-key, even after the first copy was sent', () => {
    expect(outbox.enqueue(entry('e1', T1), { cap: CAP, onceKeyHash: 'k' })).toBe(true);
    outbox.remove(['e1']);
    expect(outbox.enqueue(entry('e2', T2), { cap: CAP, onceKeyHash: 'k' })).toBe(false);
    expect(outbox.enqueue(entry('e3', T2), { cap: CAP, onceKeyHash: 'other' })).toBe(true);
    expect(outbox.list(10).map((e) => e.id)).toEqual(['e3']);
  });

  it('claims due entries oldest first and skips those backing off', () => {
    outbox.enqueue(entry('late', T2), { cap: CAP });
    outbox.enqueue(entry('early', T1), { cap: CAP });
    outbox.enqueue(entry('waiting', T1), { cap: CAP });
    outbox.recordFailure(['waiting'], T3);

    expect(outbox.claimDue(T2, 1, T3).map((e) => e.id)).toEqual(['early']);
    expect(outbox.claimDue(T2, 10, T3).map((e) => e.id)).toEqual(['late']);
  });

  it('leases a claimed batch so a second sender cannot take it until the lease ends', () => {
    outbox.enqueue(entry('e1', T1), { cap: CAP });
    const lease = new Date(T2.getTime() + 120_000);

    expect(outbox.claimDue(T2, 10, lease)).toEqual([
      { ...entry('e1', T1), attempts: 0, nextAttemptAt: lease },
    ]);
    expect(outbox.claimDue(T2, 10, lease)).toEqual([]);
    expect(outbox.claimDue(lease, 10, T3).map((e) => e.id)).toEqual(['e1']);
  });

  it('counts failed attempts per entry', () => {
    outbox.enqueue(entry('e1', T1), { cap: CAP });
    outbox.recordFailure(['e1'], T2);
    outbox.recordFailure(['e1'], T3);
    expect(outbox.list(1)[0]).toMatchObject({ attempts: 2, nextAttemptAt: T3 });
  });

  it('trims the oldest entries beyond the cap', () => {
    outbox.enqueue(entry('a', T1), { cap: 2 });
    outbox.enqueue(entry('b', T2), { cap: 2 });
    outbox.enqueue(entry('c', T3), { cap: 2 });
    expect(outbox.list(10).map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('removes and clears', () => {
    outbox.enqueue(entry('a', T1), { cap: CAP });
    outbox.enqueue(entry('b', T2), { cap: CAP });
    outbox.remove(['a']);
    expect(outbox.count()).toBe(1);
    outbox.clear();
    expect(outbox.count()).toBe(0);
  });
});

describe('settings telemetry columns', () => {
  let db: Database.Database;
  let settingsRepo: SQLiteSettingsRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    settingsRepo = new SQLiteSettingsRepository(db);
  });

  afterEach(() => db.close());

  it('reads back the defaults for a fresh install', async () => {
    const settings = createDefaultSettings();
    await settingsRepo.initialize(settings);
    expect((await settingsRepo.load())?.telemetry).toEqual(settings.telemetry);
  });

  it('round-trips two different non-default writes through UPDATE', async () => {
    const settings = createDefaultSettings();
    await settingsRepo.initialize(settings);

    const first = {
      enabled: false,
      includeIdentity: false,
      contactConsent: true,
      installId: 'install-1',
      noticeShownAt: T1,
      lastHeartbeatAt: T2,
    };
    await settingsRepo.update({ ...settings, telemetry: first });
    expect((await settingsRepo.load())?.telemetry).toEqual(first);

    const second = {
      enabled: true,
      includeIdentity: true,
      contactConsent: false,
      installId: 'install-2',
      noticeShownAt: T2,
      lastHeartbeatAt: T3,
    };
    await settingsRepo.update({ ...settings, telemetry: second });
    expect((await settingsRepo.load())?.telemetry).toEqual(second);
  });
});
