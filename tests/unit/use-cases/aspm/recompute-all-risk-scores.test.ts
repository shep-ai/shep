/**
 * RecomputeAllRiskScoresUseCase unit tests
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-28.
 * Asserts paged iteration, single-finding failure isolation, and that the
 * default filter targets Open findings only.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { type ComputeRiskScoreForFindingUseCase } from '@/application/use-cases/aspm/findings/compute-risk-score-for-finding';
import { RecomputeAllRiskScoresUseCase } from '@/application/use-cases/aspm/findings/recompute-all-risk-scores';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@/domain/generated/output';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface';

function makeFinding(id: string): SecurityFinding {
  const now = new Date();
  return {
    id,
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
  } as SecurityFinding;
}

function makeListMock(findings: SecurityFinding[], pageSize: number) {
  const listFn = vi.fn(async (_filter: unknown, cursor: { offset: number; limit: number }) => {
    const slice = findings.slice(cursor.offset, cursor.offset + cursor.limit);
    return { items: slice, total: findings.length };
  });
  const repo: IFindingRepository = {
    list: listFn,
  } as unknown as IFindingRepository;
  return { repo, listFn, pageSize };
}

describe('RecomputeAllRiskScoresUseCase', () => {
  it('recomputes every finding in the result set', async () => {
    const findings = Array.from({ length: 5 }, (_, i) => makeFinding(`f-${i}`));
    const { repo } = makeListMock(findings, 200);
    const compute = {
      execute: vi.fn().mockResolvedValue({ riskScore: {} as never, finding: {} as never }),
    } as unknown as ComputeRiskScoreForFindingUseCase;

    const uc = new RecomputeAllRiskScoresUseCase(repo, compute);
    const result = await uc.execute();

    expect(result.total).toBe(5);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toHaveLength(0);
    expect(compute.execute).toHaveBeenCalledTimes(5);
  });

  it('isolates per-finding failures and continues the run', async () => {
    const findings = [makeFinding('a'), makeFinding('b'), makeFinding('c')];
    const { repo } = makeListMock(findings, 200);
    const compute = {
      execute: vi.fn().mockImplementation(async ({ findingId }: { findingId: string }) => {
        if (findingId === 'b') throw new Error('boom');
        return { riskScore: {} as never, finding: {} as never };
      }),
    } as unknown as ComputeRiskScoreForFindingUseCase;

    const uc = new RecomputeAllRiskScoresUseCase(repo, compute);
    const result = await uc.execute();

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toEqual([{ findingId: 'b', message: 'boom' }]);
  });

  it('walks through pages until the total is reached', async () => {
    const findings = Array.from({ length: 7 }, (_, i) => makeFinding(`f-${i}`));
    const { repo, listFn } = makeListMock(findings, 3);
    const compute = {
      execute: vi.fn().mockResolvedValue({ riskScore: {} as never, finding: {} as never }),
    } as unknown as ComputeRiskScoreForFindingUseCase;

    const uc = new RecomputeAllRiskScoresUseCase(repo, compute);
    const result = await uc.execute({ pageSize: 3 });

    expect(result.total).toBe(7);
    expect(result.succeeded).toBe(7);
    // 7 items / 3 per page = 3 page fetches (3 + 3 + 1).
    expect(listFn).toHaveBeenCalledTimes(3);
  });

  it('defaults to filtering on Open findings only', async () => {
    const { repo, listFn } = makeListMock([], 200);
    const compute = {
      execute: vi.fn(),
    } as unknown as ComputeRiskScoreForFindingUseCase;

    const uc = new RecomputeAllRiskScoresUseCase(repo, compute);
    await uc.execute();

    expect(listFn).toHaveBeenCalledOnce();
    const [filter] = listFn.mock.calls[0];
    expect(filter).toEqual({ states: [FindingState.Open] });
  });

  it('passes a custom filter through unchanged', async () => {
    const { repo, listFn } = makeListMock([], 200);
    const compute = {
      execute: vi.fn(),
    } as unknown as ComputeRiskScoreForFindingUseCase;

    const customFilter = { applicationIds: ['app-1'], kev: true };
    const uc = new RecomputeAllRiskScoresUseCase(repo, compute);
    await uc.execute({ filter: customFilter });

    const [filter] = listFn.mock.calls[0];
    expect(filter).toEqual(customFilter);
  });
});
