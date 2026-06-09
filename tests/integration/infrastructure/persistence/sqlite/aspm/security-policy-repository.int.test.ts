/**
 * SQLiteSecurityPolicyRepository round-trip integration tests.
 *
 * Feature 098, phase 6 (task-32). Verifies the repository correctly
 * persists, reads, updates, and (soft-)deletes SecurityPolicy rows
 * including the SLA-window mapping and the "at most one active" invariant.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSecurityPolicyRepository } from '@/infrastructure/repositories/aspm/sqlite-security-policy-repository.js';
import { CanonicalSeverity, type SecurityPolicy } from '@/domain/generated/output.js';

function makePolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  const now = new Date();
  return {
    id: randomUUID(),
    name: 'Stricter',
    active: false,
    slaWindows: [
      { severity: CanonicalSeverity.Critical, windowDays: 3 },
      { severity: CanonicalSeverity.High, windowDays: 14 },
      { severity: CanonicalSeverity.Medium, windowDays: 60 },
      { severity: CanonicalSeverity.Low, windowDays: 120 },
    ],
    maxIngestBytes: BigInt(50 * 1024 * 1024),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteSecurityPolicyRepository', () => {
  let db: Database.Database;
  let repo: SQLiteSecurityPolicyRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteSecurityPolicyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns the seeded default policy via findActive()', async () => {
    const active = await repo.findActive();
    expect(active).not.toBeNull();
    expect(active!.name).toBe('Default');
    expect(active!.active).toBe(true);
    const crit = active!.slaWindows.find((w) => w.severity === CanonicalSeverity.Critical);
    expect(crit?.windowDays).toBe(7);
  });

  it('persists and reads back a non-active policy unchanged', async () => {
    const policy = makePolicy();
    await repo.create(policy);
    const read = await repo.findById(policy.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(policy.id);
    expect(read!.name).toBe('Stricter');
    expect(read!.active).toBe(false);
    expect(read!.maxIngestBytes).toBe(BigInt(50 * 1024 * 1024));
    expect(
      read!.slaWindows.find((w) => w.severity === CanonicalSeverity.Critical)?.windowDays
    ).toBe(3);
  });

  it('activating a new policy via create() deactivates the prior active one', async () => {
    const newer = makePolicy({ name: 'Stricter', active: true });
    await repo.create(newer);
    const active = await repo.findActive();
    expect(active!.id).toBe(newer.id);
    const all = await repo.listAll();
    const activeCount = all.filter((p) => p.active).length;
    expect(activeCount).toBe(1);
  });

  it('update() can flip active=true and deactivates the prior active', async () => {
    const other = makePolicy({ name: 'Loose' });
    await repo.create(other);

    await repo.update(other.id, { active: true });

    const active = await repo.findActive();
    expect(active!.id).toBe(other.id);

    const all = await repo.listAll();
    expect(all.filter((p) => p.active).length).toBe(1);
  });

  it('update() can change SLA windows for the active policy', async () => {
    const before = await repo.findActive();
    await repo.update(before!.id, {
      slaWindows: [{ severity: CanonicalSeverity.Critical, windowDays: 1 }],
    });
    const after = await repo.findActive();
    expect(
      after!.slaWindows.find((w) => w.severity === CanonicalSeverity.Critical)?.windowDays
    ).toBe(1);
    // Non-supplied severities are unchanged.
    expect(after!.slaWindows.find((w) => w.severity === CanonicalSeverity.High)?.windowDays).toBe(
      30
    );
  });

  it('softDelete refuses to delete the active policy', async () => {
    const active = await repo.findActive();
    await expect(repo.softDelete(active!.id)).rejects.toThrow(/active SecurityPolicy/i);
  });

  it('softDelete excludes the policy from listAll/findById once removed', async () => {
    const draft = makePolicy({ name: 'Draft' });
    await repo.create(draft);
    await repo.softDelete(draft.id);
    expect(await repo.findById(draft.id)).toBeNull();
    const all = await repo.listAll();
    expect(all.find((p) => p.id === draft.id)).toBeUndefined();
  });
});
