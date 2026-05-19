/**
 * Owner repository round-trip integration tests (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteOwnerRepository } from '@/infrastructure/repositories/aspm/sqlite-owner-repository.js';
import type { Owner } from '@/domain/generated/output.js';

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  const now = new Date();
  return {
    id: 'owner-1',
    name: 'Alice Engineer',
    handle: 'alice@example.com',
    teamId: 'team-platform',
    notes: 'On-call lead for payments',
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteOwnerRepository', () => {
  let db: Database.Database;
  let repo: SQLiteOwnerRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteOwnerRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    const owner = makeOwner();
    await repo.create(owner);

    const found = await repo.findById(owner.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(owner.id);
    expect(found!.name).toBe(owner.name);
    expect(found!.handle).toBe(owner.handle);
    expect(found!.teamId).toBe(owner.teamId);
    expect(found!.notes).toBe(owner.notes);
  });

  it('returns null for unknown id', async () => {
    expect(await repo.findById('nope')).toBeNull();
  });

  it('finds owner by handle case-insensitively', async () => {
    await repo.create(makeOwner({ handle: 'Bob@Example.com' }));
    const found = await repo.findByHandle('bob@example.com');
    expect(found).not.toBeNull();
    expect(found!.handle).toBe('Bob@Example.com');
  });

  it('lists all owners ordered by name', async () => {
    await repo.create(makeOwner({ id: 'b', name: 'Bob', handle: 'b@x.com' }));
    await repo.create(makeOwner({ id: 'a', name: 'Alice', handle: 'a@x.com' }));
    const all = await repo.listAll();
    expect(all.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('lists owners by team', async () => {
    await repo.create(makeOwner({ id: 'p1', name: 'P1', handle: 'p1@x', teamId: 'platform' }));
    await repo.create(makeOwner({ id: 'p2', name: 'P2', handle: 'p2@x', teamId: 'platform' }));
    await repo.create(makeOwner({ id: 'd1', name: 'D1', handle: 'd1@x', teamId: 'data' }));
    const platform = await repo.listByTeam('platform');
    expect(platform.map((o) => o.id).sort()).toEqual(['p1', 'p2']);
  });

  it('updates mutable fields', async () => {
    await repo.create(makeOwner());
    await repo.update('owner-1', { name: 'Alice Renamed', teamId: 'team-new' });
    const found = await repo.findById('owner-1');
    expect(found!.name).toBe('Alice Renamed');
    expect(found!.teamId).toBe('team-new');
  });

  it('soft-deletes (findById returns null but row persists)', async () => {
    await repo.create(makeOwner());
    await repo.softDelete('owner-1');
    expect(await repo.findById('owner-1')).toBeNull();
    const raw = db.prepare('SELECT deleted_at FROM owners WHERE id = ?').get('owner-1') as
      | { deleted_at: number | null }
      | undefined;
    expect(raw).toBeDefined();
    expect(raw!.deleted_at).not.toBeNull();
  });

  it('roundtrips owner with all-optional fields absent', async () => {
    await repo.create(
      makeOwner({
        id: 'minimal',
        name: 'Minimal',
        handle: undefined,
        teamId: undefined,
        notes: undefined,
      })
    );
    const found = await repo.findById('minimal');
    expect(found!.handle).toBeUndefined();
    expect(found!.teamId).toBeUndefined();
    expect(found!.notes).toBeUndefined();
  });
});
