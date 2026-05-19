/**
 * ComputeRiskScoreForFindingUseCase unit tests
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-28.
 * Asserts the use case gathers inputs from the finding + owning
 * application, calls the scorer, appends a RiskScore row, and points
 * `SecurityFinding.currentRiskScoreId` at the new row.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ComputeRiskScoreForFindingUseCase } from '@/application/use-cases/aspm/findings/compute-risk-score-for-finding';
import { FindingNotFoundError } from '@/domain/aspm/errors/finding-not-found.error';
import {
  CanonicalSeverity,
  Criticality,
  DataClassification,
  Exposure,
  FindingDomain,
  FindingState,
  type Application,
  type SecurityFinding,
  type RiskScore,
} from '@/domain/generated/output';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface';
import type { IRiskScoreRepository } from '@/application/ports/output/repositories/risk-score-repository.interface';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  const now = new Date('2026-05-01T00:00:00.000Z');
  return {
    id: 'f-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'r-1',
    title: 't',
    description: 'd',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SecurityFinding;
}

function makeApp(overrides: Partial<Application> = {}): Application {
  const now = new Date('2026-05-01T00:00:00.000Z');
  return {
    id: 'app-1',
    name: 'App',
    slug: 'app',
    description: 'd',
    repositoryPath: '/repo',
    additionalPaths: [],
    setupComplete: true,
    criticality: Criticality.Tier1,
    exposure: Exposure.Internet,
    dataClassification: DataClassification.Confidential,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Application;
}

function makeMocks(finding: SecurityFinding | null, application: Application | null) {
  const findingRepo: IFindingRepository = {
    findById: vi.fn().mockResolvedValue(finding),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as IFindingRepository;
  const riskScoreRepo: IRiskScoreRepository = {
    append: vi.fn().mockResolvedValue(undefined),
    findCurrentForFinding: vi.fn(),
    findHistory: vi.fn(),
  };
  const appRepo: IApplicationRepository = {
    findById: vi.fn().mockResolvedValue(application),
  } as unknown as IApplicationRepository;
  return { findingRepo, riskScoreRepo, appRepo };
}

describe('ComputeRiskScoreForFindingUseCase', () => {
  it('throws FindingNotFoundError when the finding does not exist', async () => {
    const { findingRepo, riskScoreRepo, appRepo } = makeMocks(null, null);
    const uc = new ComputeRiskScoreForFindingUseCase(findingRepo, riskScoreRepo, appRepo);
    await expect(uc.execute({ findingId: 'missing' })).rejects.toBeInstanceOf(FindingNotFoundError);
  });

  it('appends a risk score and updates the finding pointer', async () => {
    const finding = makeFinding({
      canonicalSeverity: CanonicalSeverity.Critical,
      kev: true,
      epssPercentile: 0.9,
    });
    const app = makeApp();
    const { findingRepo, riskScoreRepo, appRepo } = makeMocks(finding, app);
    const uc = new ComputeRiskScoreForFindingUseCase(findingRepo, riskScoreRepo, appRepo);

    const result = await uc.execute({ findingId: 'f-1' });

    expect(riskScoreRepo.append).toHaveBeenCalledOnce();
    const appended = vi.mocked(riskScoreRepo.append).mock.calls[0][0] as RiskScore;
    expect(appended.findingId).toBe('f-1');
    expect(appended.total).toBeGreaterThan(0);
    expect(appended.breakdown.kevContribution).toBeGreaterThan(0);

    expect(findingRepo.update).toHaveBeenCalledWith('f-1', {
      currentRiskScoreId: appended.id,
    });
    expect(result.riskScore.id).toBe(appended.id);
    expect(result.finding.currentRiskScoreId).toBe(appended.id);
  });

  it('degrades gracefully when the owning application cannot be loaded', async () => {
    const finding = makeFinding({ canonicalSeverity: CanonicalSeverity.High });
    const { findingRepo, riskScoreRepo, appRepo } = makeMocks(finding, null);
    const uc = new ComputeRiskScoreForFindingUseCase(findingRepo, riskScoreRepo, appRepo);

    const result = await uc.execute({ findingId: 'f-1' });

    expect(result.riskScore.breakdown.exposureContribution).toBe(0);
    expect(result.riskScore.breakdown.criticalityContribution).toBe(0);
    expect(result.riskScore.breakdown.dataClassificationContribution).toBe(0);
  });

  it('is deterministic — same finding + app produce the same total + breakdown', async () => {
    const finding = makeFinding({
      canonicalSeverity: CanonicalSeverity.Medium,
      kev: false,
      epssPercentile: 0.2,
    });
    const app = makeApp({
      criticality: Criticality.Tier2,
      exposure: Exposure.Internal,
      dataClassification: DataClassification.Internal,
    });

    const mocksA = makeMocks(finding, app);
    const mocksB = makeMocks(finding, app);
    const a = await new ComputeRiskScoreForFindingUseCase(
      mocksA.findingRepo,
      mocksA.riskScoreRepo,
      mocksA.appRepo
    ).execute({ findingId: 'f-1' });
    const b = await new ComputeRiskScoreForFindingUseCase(
      mocksB.findingRepo,
      mocksB.riskScoreRepo,
      mocksB.appRepo
    ).execute({ findingId: 'f-1' });

    // Ids and timestamps differ (each run is its own append), but the
    // breakdown contributions and total must match exactly.
    expect(b.riskScore.total).toBe(a.riskScore.total);
    expect(b.riskScore.breakdown).toEqual(a.riskScore.breakdown);
    expect(b.riskScore.inputsHash).toBe(a.riskScore.inputsHash);
  });
});
