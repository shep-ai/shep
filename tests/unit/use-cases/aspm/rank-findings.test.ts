/**
 * RankFindingsUseCase unit tests
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-29.
 * Asserts the use case normalizes the cursor, defaults to the standard
 * page size, and passes the FindingFilter unchanged to the repository.
 * Sort order itself is exercised by the repository integration test.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { RankFindingsUseCase } from '@/application/use-cases/aspm/findings/rank-findings';
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
    title: id,
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

function makeRepo(items: { finding: SecurityFinding; riskScoreTotal: number | null }[]) {
  const listRanked = vi.fn().mockResolvedValue({ items, total: items.length });
  return {
    repo: { listRanked } as unknown as IFindingRepository,
    listRanked,
  };
}

describe('RankFindingsUseCase', () => {
  it('applies sane defaults when called with no input', async () => {
    const { repo, listRanked } = makeRepo([]);
    const uc = new RankFindingsUseCase(repo);

    const result = await uc.execute();

    expect(listRanked).toHaveBeenCalledOnce();
    const [filter, cursor] = listRanked.mock.calls[0];
    expect(filter).toEqual({});
    expect(cursor).toEqual({ offset: 0, limit: 25 });
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(25);
  });

  it('passes the supplied filter through unchanged', async () => {
    const { repo, listRanked } = makeRepo([]);
    const uc = new RankFindingsUseCase(repo);
    const filter = { kev: true, severities: [CanonicalSeverity.Critical] };

    await uc.execute({ filter });

    expect(listRanked.mock.calls[0][0]).toEqual(filter);
  });

  it('clamps limit to [1, 200] and offset to >= 0', async () => {
    const { repo, listRanked } = makeRepo([]);
    const uc = new RankFindingsUseCase(repo);

    await uc.execute({ cursor: { offset: -50, limit: 9999 } });
    expect(listRanked.mock.calls[0][1]).toEqual({ offset: 0, limit: 200 });

    listRanked.mockClear();
    await uc.execute({ cursor: { offset: 0, limit: 0 } });
    expect(listRanked.mock.calls[0][1]).toEqual({ offset: 0, limit: 1 });
  });

  it('echoes the items the repository returned', async () => {
    const items = [
      { finding: makeFinding('a'), riskScoreTotal: 90 },
      { finding: makeFinding('b'), riskScoreTotal: 75 },
      { finding: makeFinding('c'), riskScoreTotal: null },
    ];
    const { repo } = makeRepo(items);
    const uc = new RankFindingsUseCase(repo);

    const result = await uc.execute();
    expect(result.items.map((i) => i.finding.id)).toEqual(['a', 'b', 'c']);
    expect(result.items.map((i) => i.riskScoreTotal)).toEqual([90, 75, null]);
    expect(result.total).toBe(3);
  });
});
