/**
 * GetPostureSummaryUseCase unit tests (feature 098, phase 7, task-40).
 *
 * Uses a mocked IFindingRepository, IRiskExceptionRepository,
 * ISecurityPolicyRepository, NoOpAiChangeRiskSignalRepository, and the
 * shared FakeSlaClock so every field of PostureSummary is independently
 * assertable.
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { GetPostureSummaryUseCase } from '@/application/use-cases/aspm/posture/get-posture-summary.js';
import {
  CanonicalSeverity,
  RiskExceptionStatus,
  type RiskException,
  type SecurityPolicy,
} from '@/domain/generated/output.js';
import type {
  AtRiskApplication,
  IFindingRepository,
  SeverityCount,
  SlaBreachThreshold,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { IRiskExceptionRepository } from '@/application/ports/output/repositories/risk-exception-repository.interface.js';
import type { ISecurityPolicyRepository } from '@/application/ports/output/repositories/security-policy-repository.interface.js';
import type { IAiChangeRiskSignalRepository } from '@/application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const FIXED_NOW = new Date('2026-05-19T12:00:00.000Z');

function makePolicy(): SecurityPolicy {
  return {
    id: 'policy-1',
    name: 'Default',
    active: true,
    slaWindows: [
      { severity: CanonicalSeverity.Critical, windowDays: 7 },
      { severity: CanonicalSeverity.High, windowDays: 30 },
      { severity: CanonicalSeverity.Medium, windowDays: 90 },
      { severity: CanonicalSeverity.Low, windowDays: 180 },
    ],
    maxIngestBytes: BigInt(100_000_000),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function fakeFindingRepo(overrides: Partial<IFindingRepository> = {}): IFindingRepository {
  return {
    create: async () => undefined,
    bulkInsertOrIgnore: async () => ({ inserted: 0, duplicates: 0 }),
    findById: async () => null,
    list: async () => ({ items: [], total: 0 }),
    listRanked: async () => ({ items: [], total: 0 }),
    count: async () => 0,
    update: async () => undefined,
    softDelete: async () => undefined,
    countOpenBySeverity: async () => [
      { severity: CanonicalSeverity.Critical, count: 3 },
      { severity: CanonicalSeverity.High, count: 7 },
      { severity: CanonicalSeverity.Medium, count: 12 },
      { severity: CanonicalSeverity.Low, count: 4 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ],
    topAtRiskApplications: async () => [
      { applicationId: 'app-a', openFindingCount: 5, riskScoreSum: 380 },
      { applicationId: 'app-b', openFindingCount: 9, riskScoreSum: 260 },
    ],
    countOpenKev: async () => 2,
    countSlaBreached: async () => 4,
    latestLastSeenAt: async () => new Date('2026-05-18T09:00:00.000Z'),
    countOpenBySeverityForApplication: async () => [],
    postureTrend: async () => [],
    ...overrides,
  } as IFindingRepository;
}

function fakeExceptionRepo(activeIds: string[]): IRiskExceptionRepository {
  return {
    create: async () => undefined,
    findById: async () => null,
    findByIdWithAudit: async () => null,
    findActiveForFinding: async () => null,
    listByStatus: async (statuses) => {
      if (!statuses.includes(RiskExceptionStatus.Active)) return [];
      return activeIds.map(
        (findingId) =>
          ({
            id: `exc-${findingId}`,
            findingId,
            reason: 'Other',
            justification: 'test',
            declaredBy: 'owner-1',
            declaredAt: FIXED_NOW,
            expiresAt: new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000),
            status: RiskExceptionStatus.Active,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          }) as unknown as RiskException
      );
    },
    updateStatus: async () => undefined,
    appendAuditEntry: async () => undefined,
    softDelete: async () => undefined,
  };
}

function fakePolicyRepo(policy: SecurityPolicy | null): ISecurityPolicyRepository {
  return {
    create: async () => undefined,
    findById: async () => null,
    findActive: async () => policy,
    listAll: async () => (policy ? [policy] : []),
    update: async () => undefined,
    softDelete: async () => undefined,
  };
}

function fakeAiRepo(count = 0): IAiChangeRiskSignalRepository {
  return {
    countOpen: async () => count,
    create: async () => undefined,
    findById: async () => null,
    list: async () => [],
    markGraduated: async () => undefined,
    markDismissed: async () => undefined,
    updateState: async () => undefined,
    softDelete: async () => undefined,
  };
}

describe('GetPostureSummaryUseCase', () => {
  it('returns all summary fields populated by the repositories', async () => {
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo(),
      fakeExceptionRepo(['f-1', 'f-2']),
      fakePolicyRepo(makePolicy()),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo(3)
    );
    const summary = await uc.execute();

    expect(summary.openBySeverity).toEqual<SeverityCount[]>([
      { severity: CanonicalSeverity.Critical, count: 3 },
      { severity: CanonicalSeverity.High, count: 7 },
      { severity: CanonicalSeverity.Medium, count: 12 },
      { severity: CanonicalSeverity.Low, count: 4 },
      { severity: CanonicalSeverity.Info, count: 0 },
    ]);
    expect(summary.topAtRiskApplications).toEqual<AtRiskApplication[]>([
      { applicationId: 'app-a', openFindingCount: 5, riskScoreSum: 380 },
      { applicationId: 'app-b', openFindingCount: 9, riskScoreSum: 260 },
    ]);
    expect(summary.kevOpenCount).toBe(2);
    expect(summary.slaBreachCount).toBe(4);
    expect(summary.exceptionCount).toBe(2);
    expect(summary.aiReviewQueueDepth).toBe(3);
    expect(summary.lastIngestedAt?.toISOString()).toBe('2026-05-18T09:00:00.000Z');
  });

  it('honors topAtRiskLimit and forwards it to the repository', async () => {
    let received = -1;
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo({
        topAtRiskApplications: async (limit) => {
          received = limit;
          return [];
        },
      }),
      fakeExceptionRepo([]),
      fakePolicyRepo(makePolicy()),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo()
    );
    await uc.execute({ topAtRiskLimit: 12 });
    expect(received).toBe(12);
  });

  it('returns 0 SLA breaches when no policy is active', async () => {
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo({
        countSlaBreached: async () => {
          throw new Error('countSlaBreached should not be called without an active policy');
        },
      }),
      fakeExceptionRepo([]),
      fakePolicyRepo(null),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo()
    );
    const summary = await uc.execute();
    expect(summary.slaBreachCount).toBe(0);
  });

  it('excludes findings that have active exceptions from the SLA breach query', async () => {
    let receivedExcluded: readonly string[] | undefined;
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo({
        countSlaBreached: async (_thresholds: SlaBreachThreshold[], _now: Date, excludeIds) => {
          receivedExcluded = excludeIds;
          return 0;
        },
      }),
      fakeExceptionRepo(['f-a', 'f-b', 'f-c']),
      fakePolicyRepo(makePolicy()),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo()
    );
    await uc.execute();
    expect(receivedExcluded).toEqual(['f-a', 'f-b', 'f-c']);
  });

  it('returns null lastIngestedAt when the repo has never seen a finding', async () => {
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo({ latestLastSeenAt: async () => null }),
      fakeExceptionRepo([]),
      fakePolicyRepo(makePolicy()),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo()
    );
    const summary = await uc.execute();
    expect(summary.lastIngestedAt).toBeNull();
  });

  it('reports 0 aiReviewQueueDepth when the NoOp signal repo is wired', async () => {
    const uc = new GetPostureSummaryUseCase(
      fakeFindingRepo(),
      fakeExceptionRepo([]),
      fakePolicyRepo(makePolicy()),
      new FakeSlaClock(FIXED_NOW),
      fakeAiRepo(0)
    );
    const summary = await uc.execute();
    expect(summary.aiReviewQueueDepth).toBe(0);
  });
});
