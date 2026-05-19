/**
 * SQLiteRiskExceptionRepository round-trip integration tests.
 *
 * Feature 098, phase 6 (task-34). Covers the declare → revoke flow with
 * audit-log append and the partial-unique constraint guarding against a
 * second active exception on the same finding.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRiskExceptionRepository } from '@/infrastructure/repositories/aspm/sqlite-risk-exception-repository.js';
import {
  ExceptionReason,
  RiskExceptionStatus,
  type RiskException,
} from '@/domain/generated/output.js';

function makeException(overrides: Partial<RiskException> = {}): RiskException {
  const now = new Date('2026-05-19T12:00:00.000Z');
  return {
    id: randomUUID(),
    findingId: randomUUID(),
    reason: ExceptionReason.FalsePositive,
    justification: 'scanner false positive — no actual data flow',
    declaredBy: randomUUID(),
    declaredAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: RiskExceptionStatus.Active,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteRiskExceptionRepository', () => {
  let db: Database.Database;
  let repo: SQLiteRiskExceptionRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteRiskExceptionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('persists a declared exception with its initial audit entry', async () => {
    const ex = makeException();
    await repo.create(ex, {
      at: ex.declaredAt.toISOString(),
      actor: ex.declaredBy,
      action: 'declared',
      note: ex.justification,
    });

    const read = await repo.findByIdWithAudit(ex.id);
    expect(read).not.toBeNull();
    expect(read!.exception.id).toBe(ex.id);
    expect(read!.exception.findingId).toBe(ex.findingId);
    expect(read!.exception.reason).toBe(ExceptionReason.FalsePositive);
    expect(read!.exception.status).toBe(RiskExceptionStatus.Active);
    expect(read!.audit).toHaveLength(1);
    expect(read!.audit[0].action).toBe('declared');
  });

  it('findActiveForFinding returns the active exception, ignores revoked', async () => {
    const findingId = randomUUID();
    const ex = makeException({ findingId });
    await repo.create(ex, { at: 'now', actor: 'tester', action: 'declared' });

    expect((await repo.findActiveForFinding(findingId))?.id).toBe(ex.id);

    await repo.updateStatus(ex.id, RiskExceptionStatus.Revoked, {
      at: 'later',
      actor: 'tester',
      action: 'revoked',
      note: 'no longer applicable',
    });

    expect(await repo.findActiveForFinding(findingId)).toBeNull();
  });

  it('declare→revoke flow appends entries to the audit log without overwriting prior ones', async () => {
    const ex = makeException();
    await repo.create(ex, { at: 'a', actor: 'alice', action: 'declared' });
    await repo.updateStatus(ex.id, RiskExceptionStatus.Revoked, {
      at: 'b',
      actor: 'bob',
      action: 'revoked',
      note: 'fixed in PR #42',
    });

    const read = await repo.findByIdWithAudit(ex.id);
    expect(read!.audit.map((e) => e.action)).toEqual(['declared', 'revoked']);
    expect(read!.exception.status).toBe(RiskExceptionStatus.Revoked);
  });

  it('rejects a second Active exception on the same finding via the unique index', async () => {
    const findingId = randomUUID();
    await repo.create(makeException({ findingId }), { at: 'a', actor: 'x', action: 'declared' });
    const second = makeException({ findingId });
    await expect(
      repo.create(second, { at: 'b', actor: 'y', action: 'declared' })
    ).rejects.toThrow();
  });

  it('allows a new Active exception after the prior one is revoked', async () => {
    const findingId = randomUUID();
    const first = makeException({ findingId });
    await repo.create(first, { at: 'a', actor: 'x', action: 'declared' });
    await repo.updateStatus(first.id, RiskExceptionStatus.Revoked, {
      at: 'b',
      actor: 'x',
      action: 'revoked',
    });

    const second = makeException({ findingId });
    await expect(
      repo.create(second, { at: 'c', actor: 'x', action: 'declared' })
    ).resolves.not.toThrow();
  });

  it('listByStatus returns rows in expires_at order with status filter applied', async () => {
    const farFuture = makeException({
      expiresAt: new Date('2027-12-01T00:00:00Z'),
    });
    const nearFuture = makeException({
      expiresAt: new Date('2026-06-01T00:00:00Z'),
    });
    await repo.create(farFuture, { at: 'a', actor: 'x', action: 'declared' });
    await repo.create(nearFuture, { at: 'b', actor: 'x', action: 'declared' });

    const all = await repo.listByStatus([RiskExceptionStatus.Active]);
    expect(all.map((e) => e.id)).toEqual([nearFuture.id, farFuture.id]);
  });

  it('listByStatus with expiringWithinDays restricts to the requested window', async () => {
    const now = new Date('2026-05-19T12:00:00Z');
    const inThree = makeException({ expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) });
    const inThirty = makeException({
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
    await repo.create(inThree, { at: 'a', actor: 'x', action: 'declared' });
    await repo.create(inThirty, { at: 'b', actor: 'x', action: 'declared' });

    const within7 = await repo.listByStatus([RiskExceptionStatus.Active], {
      expiringWithinDays: 7,
      now,
    });
    expect(within7.map((e) => e.id)).toEqual([inThree.id]);
  });

  it('softDelete excludes the exception from queries while preserving the row', async () => {
    const ex = makeException();
    await repo.create(ex, { at: 'a', actor: 'x', action: 'declared' });
    await repo.softDelete(ex.id);
    expect(await repo.findById(ex.id)).toBeNull();
    expect(await repo.findActiveForFinding(ex.findingId)).toBeNull();
  });

  it('appendAuditEntry adds without changing status', async () => {
    const ex = makeException();
    await repo.create(ex, { at: 'a', actor: 'x', action: 'declared' });
    await repo.appendAuditEntry(ex.id, {
      at: 'b',
      actor: 'auto',
      action: 'note',
      note: 'reviewed',
    });
    const read = await repo.findByIdWithAudit(ex.id);
    expect(read!.exception.status).toBe(RiskExceptionStatus.Active);
    expect(read!.audit).toHaveLength(2);
    expect(read!.audit[1].action).toBe('note');
  });
});
