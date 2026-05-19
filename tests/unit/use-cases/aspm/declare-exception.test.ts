/**
 * DeclareExceptionUseCase unit tests (feature 098, phase 6, task-36).
 *
 * Uses mocked repos + the shared FakeSlaClock so the test fully controls
 * "now" and never touches real persistence.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeclareExceptionUseCase } from '@/application/use-cases/aspm/exceptions/declare-exception.js';
import { ExceptionAlreadyActiveError } from '@/domain/aspm/errors/exception-already-active.error.js';
import { FindingNotFoundError } from '@/domain/aspm/errors/finding-not-found.error.js';
import {
  CanonicalSeverity,
  ExceptionReason,
  FindingDomain,
  FindingState,
  RiskExceptionStatus,
  type RiskException,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import type {
  IRiskExceptionRepository,
  RiskExceptionAuditEntry,
} from '@/application/ports/output/repositories/risk-exception-repository.interface.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

class FakeExceptionRepo implements IRiskExceptionRepository {
  store = new Map<string, { exception: RiskException; audit: RiskExceptionAuditEntry[] }>();
  active = new Map<string, RiskException>();

  async create(exception: RiskException, initial: RiskExceptionAuditEntry): Promise<void> {
    if (this.active.has(exception.findingId)) {
      throw new Error('unique violation');
    }
    this.store.set(exception.id, { exception, audit: [initial] });
    if (exception.status === RiskExceptionStatus.Active) {
      this.active.set(exception.findingId, exception);
    }
  }
  async findById(id: string): Promise<RiskException | null> {
    return this.store.get(id)?.exception ?? null;
  }
  async findByIdWithAudit(id: string) {
    const entry = this.store.get(id);
    return entry ? { exception: entry.exception, audit: entry.audit } : null;
  }
  async findActiveForFinding(findingId: string): Promise<RiskException | null> {
    return this.active.get(findingId) ?? null;
  }
  async listByStatus(): Promise<RiskException[]> {
    return [];
  }
  async updateStatus(): Promise<void> {
    // not exercised here
  }
  async appendAuditEntry(): Promise<void> {
    // not exercised here
  }
  async softDelete(): Promise<void> {
    // not exercised here
  }
}

function makeFinding(id: string): SecurityFinding {
  return {
    id,
    applicationId: randomUUID(),
    findingDomain: FindingDomain.Code,
    ruleId: 'rule-a',
    title: 'Title',
    description: 'desc',
    rawSeverity: 'high',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:test',
    discoveredAt: new Date('2026-05-01T00:00:00Z'),
    lastSeenAt: new Date('2026-05-01T00:00:00Z'),
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
}

class FakeFindingRepo {
  found = new Map<string, SecurityFinding>();
  async findById(id: string): Promise<SecurityFinding | null> {
    return this.found.get(id) ?? null;
  }
}

describe('DeclareExceptionUseCase', () => {
  let findings: FakeFindingRepo;
  let exceptions: FakeExceptionRepo;
  let clock: FakeSlaClock;
  let uc: DeclareExceptionUseCase;

  beforeEach(() => {
    findings = new FakeFindingRepo();
    exceptions = new FakeExceptionRepo();
    clock = new FakeSlaClock(new Date('2026-05-19T12:00:00Z'));
    uc = new DeclareExceptionUseCase(exceptions, findings as unknown as IFindingRepository, clock);
  });

  it('persists a new Active exception with the initial audit entry', async () => {
    const finding = makeFinding(randomUUID());
    findings.found.set(finding.id, finding);

    const result = await uc.execute({
      findingId: finding.id,
      reason: ExceptionReason.FalsePositive,
      justification: 'not actually exploitable',
      declaredBy: 'owner-1',
      expiresAt: new Date('2026-06-01T00:00:00Z'),
    });

    expect(result.status).toBe(RiskExceptionStatus.Active);
    expect(result.findingId).toBe(finding.id);
    expect(result.declaredAt.getTime()).toBe(clock.now().getTime());

    const persisted = await exceptions.findByIdWithAudit(result.id);
    expect(persisted!.audit).toHaveLength(1);
    expect(persisted!.audit[0].action).toBe('declared');
    expect(persisted!.audit[0].actor).toBe('owner-1');
  });

  it('rejects when the finding does not exist', async () => {
    await expect(
      uc.execute({
        findingId: 'unknown',
        reason: ExceptionReason.AcceptedRisk,
        justification: 'x',
        declaredBy: 'owner-1',
        expiresAt: new Date('2026-06-01T00:00:00Z'),
      })
    ).rejects.toBeInstanceOf(FindingNotFoundError);
  });

  it('rejects when expiresAt is at/before now', async () => {
    const finding = makeFinding(randomUUID());
    findings.found.set(finding.id, finding);
    await expect(
      uc.execute({
        findingId: finding.id,
        reason: ExceptionReason.AcceptedRisk,
        justification: 'x',
        declaredBy: 'owner-1',
        expiresAt: clock.now(),
      })
    ).rejects.toThrow(/must be in the future/i);
  });

  it('rejects when justification is empty/whitespace-only', async () => {
    const finding = makeFinding(randomUUID());
    findings.found.set(finding.id, finding);
    await expect(
      uc.execute({
        findingId: finding.id,
        reason: ExceptionReason.AcceptedRisk,
        justification: '   ',
        declaredBy: 'owner-1',
        expiresAt: new Date('2026-06-01T00:00:00Z'),
      })
    ).rejects.toThrow(/justification cannot be empty/i);
  });

  it('throws ExceptionAlreadyActiveError when one already exists for the finding', async () => {
    const finding = makeFinding(randomUUID());
    findings.found.set(finding.id, finding);

    await uc.execute({
      findingId: finding.id,
      reason: ExceptionReason.FalsePositive,
      justification: 'first',
      declaredBy: 'a',
      expiresAt: new Date('2026-06-01T00:00:00Z'),
    });

    await expect(
      uc.execute({
        findingId: finding.id,
        reason: ExceptionReason.AcceptedRisk,
        justification: 'second',
        declaredBy: 'b',
        expiresAt: new Date('2026-06-15T00:00:00Z'),
      })
    ).rejects.toBeInstanceOf(ExceptionAlreadyActiveError);
  });
});
