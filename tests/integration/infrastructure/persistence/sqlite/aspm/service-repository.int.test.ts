/**
 * Service repository round-trip integration tests (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteServiceRepository } from '@/infrastructure/repositories/aspm/sqlite-service-repository.js';
import { Exposure, type Service } from '@/domain/generated/output.js';

function makeService(overrides: Partial<Service> = {}): Service {
  const now = new Date();
  return {
    id: 'svc-1',
    name: 'auth-worker',
    slug: 'auth-worker',
    applicationId: 'app-1',
    ownerId: 'owner-1',
    exposure: Exposure.Internal,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteServiceRepository', () => {
  let db: Database.Database;
  let repo: SQLiteServiceRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteServiceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    await repo.create(makeService());
    const found = await repo.findById('svc-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('auth-worker');
    expect(found!.applicationId).toBe('app-1');
    expect(found!.exposure).toBe(Exposure.Internal);
  });

  it('findByApplicationId returns only services for that application', async () => {
    await repo.create(makeService({ id: 'a1', name: 'a1', slug: 'a1', applicationId: 'app-1' }));
    await repo.create(makeService({ id: 'a2', name: 'a2', slug: 'a2', applicationId: 'app-1' }));
    await repo.create(makeService({ id: 'b1', name: 'b1', slug: 'b1', applicationId: 'app-2' }));
    const inApp1 = await repo.findByApplicationId('app-1');
    expect(inApp1.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
  });

  it('enforces unique slug within an application', async () => {
    await repo.create(makeService({ id: 'a', slug: 'svc', applicationId: 'app-1' }));
    await expect(
      repo.create(makeService({ id: 'b', slug: 'SVC', applicationId: 'app-1' }))
    ).rejects.toThrow();
  });

  it('allows same slug in different applications', async () => {
    await repo.create(makeService({ id: 'a', slug: 'svc', applicationId: 'app-1' }));
    await expect(
      repo.create(makeService({ id: 'b', slug: 'svc', applicationId: 'app-2' }))
    ).resolves.not.toThrow();
  });

  it('updates mutable fields', async () => {
    await repo.create(makeService());
    await repo.update('svc-1', { name: 'auth-worker-v2', exposure: Exposure.Internet });
    const found = await repo.findById('svc-1');
    expect(found!.name).toBe('auth-worker-v2');
    expect(found!.exposure).toBe(Exposure.Internet);
  });

  it('soft-deletes', async () => {
    await repo.create(makeService());
    await repo.softDelete('svc-1');
    expect(await repo.findById('svc-1')).toBeNull();
  });

  it('handles optional fields absent', async () => {
    await repo.create(
      makeService({ id: 'min', slug: undefined, ownerId: undefined, exposure: undefined })
    );
    const found = await repo.findById('min');
    expect(found!.slug).toBeUndefined();
    expect(found!.ownerId).toBeUndefined();
    expect(found!.exposure).toBeUndefined();
  });
});
