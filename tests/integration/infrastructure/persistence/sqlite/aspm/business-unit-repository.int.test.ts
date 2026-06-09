/**
 * BusinessUnit repository round-trip integration tests (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteBusinessUnitRepository } from '@/infrastructure/repositories/aspm/sqlite-business-unit-repository.js';
import type { BusinessUnit } from '@/domain/generated/output.js';

function makeBU(overrides: Partial<BusinessUnit> = {}): BusinessUnit {
  const now = new Date();
  return {
    id: 'bu-1',
    name: 'Engineering',
    slug: 'eng',
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteBusinessUnitRepository', () => {
  let db: Database.Database;
  let repo: SQLiteBusinessUnitRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteBusinessUnitRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    await repo.create(makeBU());
    const found = await repo.findById('bu-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Engineering');
    expect(found!.slug).toBe('eng');
  });

  it('finds business unit by slug case-insensitively', async () => {
    await repo.create(makeBU({ slug: 'Eng' }));
    const found = await repo.findBySlug('eng');
    expect(found).not.toBeNull();
  });

  it('lists all in name order', async () => {
    await repo.create(makeBU({ id: 'b', name: 'B', slug: 'b' }));
    await repo.create(makeBU({ id: 'a', name: 'A', slug: 'a' }));
    const all = await repo.listAll();
    expect(all.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('updates fields', async () => {
    await repo.create(makeBU());
    await repo.update('bu-1', { name: 'Platform Eng' });
    const found = await repo.findById('bu-1');
    expect(found!.name).toBe('Platform Eng');
  });

  it('soft-deletes', async () => {
    await repo.create(makeBU());
    await repo.softDelete('bu-1');
    expect(await repo.findById('bu-1')).toBeNull();
  });
});
