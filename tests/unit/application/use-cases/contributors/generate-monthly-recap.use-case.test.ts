import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GenerateMonthlyRecapUseCase } from '@/application/use-cases/contributors/generate-monthly-recap.use-case.js';
import {
  ContributorLane,
  ContributorLevel,
  RecognitionKind,
  type Contributor,
  type RecognitionEvent,
} from '@/domain/generated/output.js';
import type { IContributorRepository } from '@/application/ports/output/repositories/contributor-repository.interface.js';
import type { IRecognitionEventRepository } from '@/application/ports/output/repositories/recognition-event-repository.interface.js';

function makeContributor(overrides: Partial<Contributor> = {}): Contributor {
  return {
    id: `c-${overrides.githubLogin ?? 'x'}`,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    githubLogin: 'x',
    level: ContributorLevel.Contributor,
    firstContributionAt: '2026-04-01T00:00:00Z',
    lastContributionAt: '2026-04-01T00:00:00Z',
    prCount: 1,
    issueCount: 0,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<RecognitionEvent>): RecognitionEvent {
  return {
    id: `e-${overrides.id ?? Math.random().toString(36).slice(2, 8)}`,
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    contributorId: 'c-x',
    kind: RecognitionKind.FirstPR,
    occurredAt: '2026-04-10T00:00:00Z',
    prNumber: 1,
    ...overrides,
  };
}

describe('GenerateMonthlyRecapUseCase', () => {
  it('produces a markdown artifact with stats and contributor list', async () => {
    const alice = makeContributor({ githubLogin: 'alice', lane: ContributorLane.Docs });
    const bob = makeContributor({
      githubLogin: 'bob',
      lane: ContributorLane.Agents,
      prCount: 5,
    });
    const events = [
      makeEvent({ contributorId: alice.id, kind: RecognitionKind.FirstPR, prNumber: 11 }),
      makeEvent({ contributorId: bob.id, kind: RecognitionKind.NthPR, prNumber: 12 }),
      makeEvent({ contributorId: bob.id, kind: RecognitionKind.NthPR, prNumber: 13 }),
    ];

    const eventsRepo: IRecognitionEventRepository = {
      insert: vi.fn(),
      findByContributorId: vi.fn(),
      findByMonth: vi.fn().mockResolvedValue(events),
    };
    const contributorsRepo: IContributorRepository = {
      create: vi.fn(),
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === alice.id) return alice;
        if (id === bob.id) return bob;
        return null;
      }),
      findByGitHubLogin: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listAll: vi.fn(),
      findTopByPrCount: vi.fn(),
    };

    const useCase = new GenerateMonthlyRecapUseCase(contributorsRepo, eventsRepo);
    const result = await useCase.execute({ yearMonth: '2026-04' });

    expect(result.artifact.recapId).toBe('2026-04');
    expect(result.artifact.title).toContain('2026-04');
    expect(result.artifact.body).toContain('@alice');
    expect(result.artifact.body).toContain('@bob');
    expect(result.stats.totalEvents).toBe(3);
    expect(result.stats.newContributors).toBe(1);
    expect(result.stats.prsRecognized).toBe(3);
    expect(result.stats.topContributorLogin).toBe('bob');
    expect(eventsRepo.findByMonth).toHaveBeenCalledWith('2026-04');
  });

  it('handles months with no recognition events', async () => {
    const eventsRepo: IRecognitionEventRepository = {
      insert: vi.fn(),
      findByContributorId: vi.fn(),
      findByMonth: vi.fn().mockResolvedValue([]),
    };
    const contributorsRepo: IContributorRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByGitHubLogin: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listAll: vi.fn(),
      findTopByPrCount: vi.fn(),
    };
    const useCase = new GenerateMonthlyRecapUseCase(contributorsRepo, eventsRepo);

    const result = await useCase.execute({ yearMonth: '2026-04' });

    expect(result.stats.totalEvents).toBe(0);
    expect(result.artifact.body).toContain('No recognized contributors');
  });

  it('rejects an invalid yearMonth shape', async () => {
    const useCase = new GenerateMonthlyRecapUseCase(
      {
        create: vi.fn(),
        findById: vi.fn(),
        findByGitHubLogin: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        listAll: vi.fn(),
        findTopByPrCount: vi.fn(),
      },
      {
        insert: vi.fn(),
        findByContributorId: vi.fn(),
        findByMonth: vi.fn(),
      }
    );

    await expect(useCase.execute({ yearMonth: '2026-13' })).rejects.toThrow(/Invalid yearMonth/);
  });
});
