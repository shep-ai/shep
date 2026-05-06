import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import {
  AwardRecognitionUseCase,
  nextLevel,
} from '@/application/use-cases/contributors/award-recognition.use-case.js';
import { ContributorLevel, RecognitionKind, type Contributor } from '@/domain/generated/output.js';
import type { IContributorRepository } from '@/application/ports/output/repositories/contributor-repository.interface.js';
import type { IRecognitionEventRepository } from '@/application/ports/output/repositories/recognition-event-repository.interface.js';
import type { IAllContributorsWriter } from '@/application/ports/output/services/all-contributors-writer.interface.js';

function makeContributor(overrides: Partial<Contributor> = {}): Contributor {
  const now = '2026-04-01T00:00:00Z';
  return {
    id: 'c-1',
    createdAt: now,
    updatedAt: now,
    githubLogin: 'octocat',
    level: ContributorLevel.User,
    firstContributionAt: now,
    lastContributionAt: now,
    prCount: 0,
    issueCount: 0,
    ...overrides,
  };
}

function makeRepos(contributor: Contributor, inserted: boolean) {
  const contributors: IContributorRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(contributor),
    findByGitHubLogin: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    listAll: vi.fn(),
    findTopByPrCount: vi.fn(),
  };
  const events: IRecognitionEventRepository = {
    insert: vi.fn().mockResolvedValue({ inserted }),
    findByContributorId: vi.fn(),
    findByMonth: vi.fn(),
  };
  const writer: IAllContributorsWriter = {
    appendContributor: vi.fn().mockResolvedValue(undefined),
  };
  return { contributors, events, writer };
}

describe('AwardRecognitionUseCase', () => {
  it('inserts the event, bumps prCount + level, and writes to all-contributors on first call', async () => {
    const contributor = makeContributor({ prCount: 0, level: ContributorLevel.User });
    const { contributors, events, writer } = makeRepos(contributor, true);
    const useCase = new AwardRecognitionUseCase(contributors, events, writer);

    const result = await useCase.execute({
      contributorId: contributor.id,
      kind: RecognitionKind.FirstPR,
      prNumber: 42,
      occurredAt: '2026-05-01T10:00:00Z',
    });

    expect(result.awarded).toBe(true);
    expect(events.insert).toHaveBeenCalledTimes(1);
    expect(contributors.update).toHaveBeenCalledTimes(1);
    expect(writer.appendContributor).toHaveBeenCalledTimes(1);
    expect(writer.appendContributor).toHaveBeenCalledWith(
      expect.objectContaining({ login: 'octocat', contributions: ['code'] })
    );
    expect(result.contributor?.prCount).toBe(1);
    expect(result.contributor?.level).toBe(ContributorLevel.Contributor);
  });

  it('is idempotent — duplicate insert returns awarded=false and skips writer/update', async () => {
    const contributor = makeContributor({ prCount: 1, level: ContributorLevel.Contributor });
    const { contributors, events, writer } = makeRepos(contributor, false);
    const useCase = new AwardRecognitionUseCase(contributors, events, writer);

    const result = await useCase.execute({
      contributorId: contributor.id,
      kind: RecognitionKind.FirstPR,
      prNumber: 42,
    });

    expect(result.awarded).toBe(false);
    expect(events.insert).toHaveBeenCalledTimes(1);
    expect(contributors.update).not.toHaveBeenCalled();
    expect(writer.appendContributor).not.toHaveBeenCalled();
  });

  it('promotes contributor → core when prCount crosses the core threshold (5)', async () => {
    const contributor = makeContributor({ prCount: 4, level: ContributorLevel.Contributor });
    const { contributors, events, writer } = makeRepos(contributor, true);
    const useCase = new AwardRecognitionUseCase(contributors, events, writer);

    const result = await useCase.execute({
      contributorId: contributor.id,
      kind: RecognitionKind.NthPR,
      prNumber: 5,
    });

    expect(result.awarded).toBe(true);
    expect(result.contributor?.prCount).toBe(5);
    expect(result.contributor?.level).toBe(ContributorLevel.Core);
  });

  it('does not bump prCount for non-PR recognition kinds (e.g. monthlyShoutout)', async () => {
    const contributor = makeContributor({ prCount: 7, level: ContributorLevel.Core });
    const { contributors, events, writer } = makeRepos(contributor, true);
    const useCase = new AwardRecognitionUseCase(contributors, events, writer);

    const result = await useCase.execute({
      contributorId: contributor.id,
      kind: RecognitionKind.MonthlyShoutout,
      prNumber: 0,
      monthRecapId: '2026-04',
    });

    expect(result.awarded).toBe(true);
    expect(contributors.update).not.toHaveBeenCalled();
    expect(writer.appendContributor).toHaveBeenCalled();
  });

  it('throws when contributor cannot be found', async () => {
    const repos: IContributorRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findByGitHubLogin: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listAll: vi.fn(),
      findTopByPrCount: vi.fn(),
    };
    const events: IRecognitionEventRepository = {
      insert: vi.fn(),
      findByContributorId: vi.fn(),
      findByMonth: vi.fn(),
    };
    const writer: IAllContributorsWriter = { appendContributor: vi.fn() };
    const useCase = new AwardRecognitionUseCase(repos, events, writer);

    await expect(
      useCase.execute({ contributorId: 'missing', kind: RecognitionKind.FirstPR, prNumber: 1 })
    ).rejects.toThrow(/Contributor not found/);
  });
});

describe('nextLevel', () => {
  it('does not demote a contributor whose count drops below threshold', () => {
    expect(nextLevel(ContributorLevel.Maintainer, 1)).toBe(ContributorLevel.Maintainer);
  });
  it('promotes user → contributor at 1 PR', () => {
    expect(nextLevel(ContributorLevel.User, 1)).toBe(ContributorLevel.Contributor);
  });
  it('promotes contributor → core at 5 PRs', () => {
    expect(nextLevel(ContributorLevel.Contributor, 5)).toBe(ContributorLevel.Core);
  });
  it('promotes to maintainer at 25 PRs', () => {
    expect(nextLevel(ContributorLevel.Core, 25)).toBe(ContributorLevel.Maintainer);
  });
});
