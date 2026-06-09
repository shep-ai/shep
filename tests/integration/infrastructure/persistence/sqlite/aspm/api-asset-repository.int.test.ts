/**
 * ApiAsset repository round-trip integration tests (feature 098, phase 2).
 *
 * Covers path normalization (NFR-11) — the mapper stores schemaPath with
 * POSIX separators regardless of the input platform.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteApiAssetRepository } from '@/infrastructure/repositories/aspm/sqlite-api-asset-repository.js';
import { Exposure, type ApiAsset } from '@/domain/generated/output.js';

function makeApi(overrides: Partial<ApiAsset> = {}): ApiAsset {
  const now = new Date();
  return {
    id: 'api-1',
    name: 'public-v1',
    baseUrl: 'https://api.example.com/v1',
    applicationId: 'app-1',
    ownerId: 'owner-1',
    exposure: Exposure.Internet,
    schemaPath: 'apis/public-v1.yaml',
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteApiAssetRepository', () => {
  let db: Database.Database;
  let repo: SQLiteApiAssetRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteApiAssetRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    await repo.create(makeApi());
    const found = await repo.findById('api-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('public-v1');
    expect(found!.baseUrl).toBe('https://api.example.com/v1');
    expect(found!.exposure).toBe(Exposure.Internet);
  });

  it('findByApplicationId scopes correctly', async () => {
    await repo.create(makeApi({ id: 'a1', name: 'a1', applicationId: 'app-1' }));
    await repo.create(makeApi({ id: 'b1', name: 'b1', applicationId: 'app-2' }));
    const inApp1 = await repo.findByApplicationId('app-1');
    expect(inApp1.map((a) => a.id)).toEqual(['a1']);
  });

  it('normalizes schemaPath to POSIX separators on create', async () => {
    await repo.create(makeApi({ id: 'win', schemaPath: 'apis\\public\\v1.yaml' }));
    const found = await repo.findById('win');
    expect(found!.schemaPath).toBe('apis/public/v1.yaml');
  });

  it('normalizes schemaPath on update', async () => {
    await repo.create(makeApi());
    await repo.update('api-1', { schemaPath: 'apis\\private\\v2.yaml' });
    const found = await repo.findById('api-1');
    expect(found!.schemaPath).toBe('apis/private/v2.yaml');
  });

  it('enforces unique name within an application (case-insensitive)', async () => {
    await repo.create(makeApi({ id: 'a', name: 'Same-Name', applicationId: 'app-1' }));
    await expect(
      repo.create(makeApi({ id: 'b', name: 'same-name', applicationId: 'app-1' }))
    ).rejects.toThrow();
  });

  it('soft-deletes', async () => {
    await repo.create(makeApi());
    await repo.softDelete('api-1');
    expect(await repo.findById('api-1')).toBeNull();
  });

  it('handles optional fields absent', async () => {
    await repo.create(
      makeApi({
        id: 'min',
        name: 'min',
        baseUrl: undefined,
        ownerId: undefined,
        exposure: undefined,
        schemaPath: undefined,
      })
    );
    const found = await repo.findById('min');
    expect(found!.baseUrl).toBeUndefined();
    expect(found!.ownerId).toBeUndefined();
    expect(found!.exposure).toBeUndefined();
    expect(found!.schemaPath).toBeUndefined();
  });
});
