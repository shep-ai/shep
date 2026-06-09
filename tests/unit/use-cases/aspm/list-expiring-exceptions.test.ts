/**
 * ListExpiringExceptionsUseCase unit tests (feature 098, phase 6, task-36).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_EXPIRING_WINDOW_DAYS,
  ListExpiringExceptionsUseCase,
} from '@/application/use-cases/aspm/exceptions/list-expiring-exceptions.js';
import {
  ExceptionReason,
  RiskExceptionStatus,
  type RiskException,
} from '@/domain/generated/output.js';
import type { IRiskExceptionRepository } from '@/application/ports/output/repositories/risk-exception-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const NOW = new Date('2026-05-19T12:00:00Z');

function makeException(expiresAt: Date): RiskException {
  return {
    id: randomUUID(),
    findingId: randomUUID(),
    reason: ExceptionReason.FalsePositive,
    justification: 'r',
    declaredBy: 'o',
    declaredAt: new Date(NOW.getTime() - 1000),
    expiresAt,
    status: RiskExceptionStatus.Active,
    createdAt: new Date(NOW.getTime() - 1000),
    updatedAt: new Date(NOW.getTime() - 1000),
  };
}

class FakeExceptionRepo implements IRiskExceptionRepository {
  recorded?: {
    statuses: RiskExceptionStatus[];
    options: { expiringWithinDays?: number; now?: Date };
  };
  toReturn: RiskException[] = [];

  async create(): Promise<void> {
    return undefined;
  }
  async findById() {
    return null;
  }
  async findByIdWithAudit() {
    return null;
  }
  async findActiveForFinding() {
    return null;
  }
  async listByStatus(
    statuses: RiskExceptionStatus[],
    options: { expiringWithinDays?: number; now?: Date } = {}
  ): Promise<RiskException[]> {
    this.recorded = { statuses, options };
    return this.toReturn;
  }
  async updateStatus(): Promise<void> {
    return undefined;
  }
  async appendAuditEntry(): Promise<void> {
    return undefined;
  }
  async softDelete(): Promise<void> {
    return undefined;
  }
}

describe('ListExpiringExceptionsUseCase', () => {
  let repo: FakeExceptionRepo;
  let clock: FakeSlaClock;
  let uc: ListExpiringExceptionsUseCase;

  beforeEach(() => {
    repo = new FakeExceptionRepo();
    clock = new FakeSlaClock(NOW);
    uc = new ListExpiringExceptionsUseCase(repo, clock);
  });

  it('defaults the window to DEFAULT_EXPIRING_WINDOW_DAYS', async () => {
    await uc.execute();
    expect(repo.recorded?.options.expiringWithinDays).toBe(DEFAULT_EXPIRING_WINDOW_DAYS);
    expect(repo.recorded?.options.now?.getTime()).toBe(NOW.getTime());
    expect(repo.recorded?.statuses).toEqual([RiskExceptionStatus.Active]);
  });

  it('honors a custom window', async () => {
    await uc.execute({ withinDays: 3 });
    expect(repo.recorded?.options.expiringWithinDays).toBe(3);
  });

  it('rejects a negative window', async () => {
    await expect(uc.execute({ withinDays: -1 })).rejects.toThrow(/non-negative/);
  });

  it('returns whatever the repo returns', async () => {
    const ex = makeException(new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000));
    repo.toReturn = [ex];
    const result = await uc.execute();
    expect(result.map((r) => r.id)).toEqual([ex.id]);
  });
});
