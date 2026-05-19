/**
 * RevokeExceptionUseCase unit tests (feature 098, phase 6, task-36).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RevokeExceptionUseCase } from '@/application/use-cases/aspm/exceptions/revoke-exception.js';
import { ExceptionExpiredError } from '@/domain/aspm/errors/exception-expired.error.js';
import {
  ExceptionReason,
  RiskExceptionStatus,
  type RiskException,
} from '@/domain/generated/output.js';
import type {
  IRiskExceptionRepository,
  RiskExceptionAuditEntry,
} from '@/application/ports/output/repositories/risk-exception-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const NOW = new Date('2026-05-19T12:00:00Z');

function makeException(overrides: Partial<RiskException> = {}): RiskException {
  return {
    id: randomUUID(),
    findingId: randomUUID(),
    reason: ExceptionReason.FalsePositive,
    justification: 'reviewed',
    declaredBy: 'owner-1',
    declaredAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    status: RiskExceptionStatus.Active,
    createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    updatedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

class FakeExceptionRepo implements IRiskExceptionRepository {
  store = new Map<string, RiskException>();
  statusUpdates: { id: string; status: RiskExceptionStatus; entry: RiskExceptionAuditEntry }[] = [];

  async create(): Promise<void> {
    return undefined;
  }
  async findById(id: string): Promise<RiskException | null> {
    return this.store.get(id) ?? null;
  }
  async findByIdWithAudit() {
    return null;
  }
  async findActiveForFinding() {
    return null;
  }
  async listByStatus(): Promise<RiskException[]> {
    return [];
  }
  async updateStatus(
    id: string,
    status: RiskExceptionStatus,
    entry: RiskExceptionAuditEntry
  ): Promise<void> {
    const existing = this.store.get(id);
    if (existing) {
      this.store.set(id, { ...existing, status });
    }
    this.statusUpdates.push({ id, status, entry });
  }
  async appendAuditEntry(): Promise<void> {
    return undefined;
  }
  async softDelete(): Promise<void> {
    return undefined;
  }
}

describe('RevokeExceptionUseCase', () => {
  let repo: FakeExceptionRepo;
  let clock: FakeSlaClock;
  let uc: RevokeExceptionUseCase;

  beforeEach(() => {
    repo = new FakeExceptionRepo();
    clock = new FakeSlaClock(NOW);
    uc = new RevokeExceptionUseCase(repo, clock);
  });

  it('transitions Active → Revoked and appends an audit entry', async () => {
    const ex = makeException();
    repo.store.set(ex.id, ex);

    await uc.execute({ exceptionId: ex.id, revokedBy: 'bob', note: 'no longer needed' });

    expect(repo.statusUpdates).toHaveLength(1);
    expect(repo.statusUpdates[0].status).toBe(RiskExceptionStatus.Revoked);
    expect(repo.statusUpdates[0].entry.action).toBe('revoked');
    expect(repo.statusUpdates[0].entry.actor).toBe('bob');
    expect(repo.statusUpdates[0].entry.note).toBe('no longer needed');
  });

  it('throws when the exception does not exist', async () => {
    await expect(uc.execute({ exceptionId: 'missing', revokedBy: 'bob' })).rejects.toThrow(
      /not found/i
    );
  });

  it('throws when the exception is already Revoked', async () => {
    const ex = makeException({ status: RiskExceptionStatus.Revoked });
    repo.store.set(ex.id, ex);
    await expect(uc.execute({ exceptionId: ex.id, revokedBy: 'bob' })).rejects.toThrow(
      /only Active exceptions/i
    );
  });

  it('throws ExceptionExpiredError when the active exception has passed its expiry', async () => {
    const ex = makeException({
      expiresAt: new Date(NOW.getTime() - 60_000),
    });
    repo.store.set(ex.id, ex);
    await expect(uc.execute({ exceptionId: ex.id, revokedBy: 'bob' })).rejects.toBeInstanceOf(
      ExceptionExpiredError
    );
  });
});
