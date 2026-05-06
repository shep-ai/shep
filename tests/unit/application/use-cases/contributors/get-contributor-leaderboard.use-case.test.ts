import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GetContributorLeaderboardUseCase } from '@/application/use-cases/contributors/get-contributor-leaderboard.use-case.js';
import { ContributorLane, ContributorLevel, type Contributor } from '@/domain/generated/output.js';
import type { IContributorRepository } from '@/application/ports/output/repositories/contributor-repository.interface.js';

function makeContributor(login: string, prCount: number): Contributor {
  return {
    id: `id-${login}`,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    githubLogin: login,
    displayName: `${login} display`,
    avatarUrl: `https://avatar/${login}.png`,
    level: ContributorLevel.Contributor,
    lane: ContributorLane.Docs,
    firstContributionAt: '2026-04-01T00:00:00Z',
    lastContributionAt: '2026-04-01T00:00:00Z',
    prCount,
    issueCount: 0,
  };
}

function repoReturning(rows: readonly Contributor[]): IContributorRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByGitHubLogin: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listAll: vi.fn(),
    findTopByPrCount: vi.fn().mockResolvedValue(rows),
  };
}

describe('GetContributorLeaderboardUseCase', () => {
  it('returns mapped entries from the repository at the default limit (10)', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => makeContributor(`u${i}`, 15 - i));
    const repo = repoReturning(rows.slice(0, 10));
    const useCase = new GetContributorLeaderboardUseCase(repo);

    const result = await useCase.execute({ scope: 'allTime' });

    expect(result.limit).toBe(10);
    expect(result.entries).toHaveLength(10);
    expect(repo.findTopByPrCount).toHaveBeenCalledWith({ scope: 'allTime', limit: 10 });
    expect(result.entries[0]).toMatchObject({
      login: 'u0',
      prCount: 15,
      level: ContributorLevel.Contributor,
      lane: ContributorLane.Docs,
    });
  });

  it('passes scope and explicit limit through to the repository', async () => {
    const repo = repoReturning([makeContributor('alice', 1)]);
    const useCase = new GetContributorLeaderboardUseCase(repo);

    const result = await useCase.execute({ scope: 'month', limit: 5 });

    expect(result.scope).toBe('month');
    expect(result.limit).toBe(5);
    expect(repo.findTopByPrCount).toHaveBeenCalledWith({ scope: 'month', limit: 5 });
  });

  it('caps the requested limit at the safety ceiling (100)', async () => {
    const repo = repoReturning([]);
    const useCase = new GetContributorLeaderboardUseCase(repo);

    const result = await useCase.execute({ scope: 'allTime', limit: 5000 });

    expect(result.limit).toBe(100);
    expect(repo.findTopByPrCount).toHaveBeenCalledWith({ scope: 'allTime', limit: 100 });
  });

  it('rejects non-positive limits', async () => {
    const useCase = new GetContributorLeaderboardUseCase(repoReturning([]));
    await expect(useCase.execute({ scope: 'month', limit: 0 })).rejects.toThrow(/positive/i);
  });
});
