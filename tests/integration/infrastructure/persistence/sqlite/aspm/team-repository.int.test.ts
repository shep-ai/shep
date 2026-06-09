/**
 * Team repository round-trip integration tests (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteTeamRepository } from '@/infrastructure/repositories/aspm/sqlite-team-repository.js';
import type { Team } from '@/domain/generated/output.js';

function makeTeam(overrides: Partial<Team> = {}): Team {
  const now = new Date();
  return {
    id: 'team-1',
    name: 'Platform',
    slug: 'platform',
    businessUnitId: 'bu-engineering',
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteTeamRepository', () => {
  let db: Database.Database;
  let repo: SQLiteTeamRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteTeamRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    const team = makeTeam();
    await repo.create(team);
    const found = await repo.findById(team.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe(team.name);
    expect(found!.slug).toBe(team.slug);
    expect(found!.businessUnitId).toBe(team.businessUnitId);
  });

  it('finds team by slug case-insensitively', async () => {
    await repo.create(makeTeam({ slug: 'Payments' }));
    const found = await repo.findBySlug('payments');
    expect(found).not.toBeNull();
  });

  it('lists all teams ordered by name', async () => {
    await repo.create(makeTeam({ id: 'b', name: 'Beta', slug: 'beta' }));
    await repo.create(makeTeam({ id: 'a', name: 'Alpha', slug: 'alpha' }));
    const all = await repo.listAll();
    expect(all.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('lists teams by business unit', async () => {
    await repo.create(makeTeam({ id: 't1', name: 't1', slug: 't1-slug', businessUnitId: 'bu-x' }));
    await repo.create(makeTeam({ id: 't2', name: 't2', slug: 't2-slug', businessUnitId: 'bu-x' }));
    await repo.create(makeTeam({ id: 't3', name: 't3', slug: 't3-slug', businessUnitId: 'bu-y' }));
    const inX = await repo.listByBusinessUnit('bu-x');
    expect(inX.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('updates mutable fields', async () => {
    await repo.create(makeTeam());
    await repo.update('team-1', { name: 'Renamed', businessUnitId: 'bu-new' });
    const found = await repo.findById('team-1');
    expect(found!.name).toBe('Renamed');
    expect(found!.businessUnitId).toBe('bu-new');
  });

  it('soft-deletes', async () => {
    await repo.create(makeTeam());
    await repo.softDelete('team-1');
    expect(await repo.findById('team-1')).toBeNull();
  });

  it('handles optional fields absent', async () => {
    await repo.create(makeTeam({ id: 'min', slug: undefined, businessUnitId: undefined }));
    const found = await repo.findById('min');
    expect(found!.slug).toBeUndefined();
    expect(found!.businessUnitId).toBeUndefined();
  });
});
