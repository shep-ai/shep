/**
 * CloudEnvironment repository round-trip integration tests
 * (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteCloudEnvironmentRepository } from '@/infrastructure/repositories/aspm/sqlite-cloud-environment-repository.js';
import type { CloudEnvironment } from '@/domain/generated/output.js';

function makeEnv(overrides: Partial<CloudEnvironment> = {}): CloudEnvironment {
  const now = new Date();
  return {
    id: 'env-1',
    name: 'payments-prod',
    provider: 'aws',
    accountId: '1234567890',
    applicationId: 'app-1',
    ownerId: 'owner-1',
    region: 'us-east-1',
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('SQLiteCloudEnvironmentRepository', () => {
  let db: Database.Database;
  let repo: SQLiteCloudEnvironmentRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteCloudEnvironmentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips create → findById', async () => {
    await repo.create(makeEnv());
    const found = await repo.findById('env-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('payments-prod');
    expect(found!.provider).toBe('aws');
    expect(found!.accountId).toBe('1234567890');
    expect(found!.region).toBe('us-east-1');
  });

  it('findByApplicationId scopes correctly', async () => {
    await repo.create(makeEnv({ id: 'a1', name: 'a1', applicationId: 'app-1' }));
    await repo.create(
      makeEnv({ id: 'a2', name: 'a2', applicationId: 'app-1', region: 'us-west-2' })
    );
    await repo.create(makeEnv({ id: 'b1', name: 'b1', applicationId: 'app-2' }));
    const inApp1 = await repo.findByApplicationId('app-1');
    expect(inApp1.map((e) => e.id).sort()).toEqual(['a1', 'a2']);
  });

  it('updates mutable fields', async () => {
    await repo.create(makeEnv());
    await repo.update('env-1', { name: 'payments-prod-v2', region: 'eu-west-1' });
    const found = await repo.findById('env-1');
    expect(found!.name).toBe('payments-prod-v2');
    expect(found!.region).toBe('eu-west-1');
  });

  it('soft-deletes', async () => {
    await repo.create(makeEnv());
    await repo.softDelete('env-1');
    expect(await repo.findById('env-1')).toBeNull();
  });

  it('handles optional fields absent', async () => {
    await repo.create(
      makeEnv({
        id: 'min',
        name: 'min',
        accountId: undefined,
        ownerId: undefined,
        region: undefined,
      })
    );
    const found = await repo.findById('min');
    expect(found!.accountId).toBeUndefined();
    expect(found!.ownerId).toBeUndefined();
    expect(found!.region).toBeUndefined();
  });
});
