import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { GetCurrentHarnessUseCase } from '@/application/use-cases/harness-learning/get-current-harness.use-case.js';
import {
  InMemoryLearnedHarnessRepository,
  fakeSettingsRepository,
  fakeSpaceContext,
} from '../../../../helpers/harness-learning.fakes.js';
import {
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

const v = (over: Partial<LearnedHarnessVersion>): LearnedHarnessVersion => ({
  id: 'v1',
  scope: MemoryScope.Project,
  repositoryPath: '/repos/app',
  status: LearnedHarnessStatus.Adopted,
  origin: HarnessOrigin.Manual,
  components: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

describe('GetCurrentHarnessUseCase', () => {
  it('returns nothing while the selfLearning flag is off', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    await repo.createVersion(v({}));
    const useCase = new GetCurrentHarnessUseCase(
      fakeSettingsRepository({ selfLearning: false }),
      repo,
      fakeSpaceContext()
    );
    expect(await useCase.execute({ repositoryPath: '/repos/app' })).toBeNull();
  });

  it('returns the adopted version for the repository, normalising its path', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    await repo.createVersion(v({}));
    const useCase = new GetCurrentHarnessUseCase(
      fakeSettingsRepository(),
      repo,
      fakeSpaceContext()
    );
    expect((await useCase.execute({ repositoryPath: '\\repos\\app' }))?.id).toBe('v1');
  });

  it('falls back to the space version through the resolved space context', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    await repo.createVersion(
      v({ id: 's1', scope: MemoryScope.Space, spaceId: 'space-7', repositoryPath: '/other' })
    );
    const useCase = new GetCurrentHarnessUseCase(
      fakeSettingsRepository(),
      repo,
      fakeSpaceContext('space-7')
    );
    expect((await useCase.execute({ repositoryPath: '/repos/app' }))?.id).toBe('s1');
  });

  it('returns nothing for a blank repository path', async () => {
    const useCase = new GetCurrentHarnessUseCase(
      fakeSettingsRepository(),
      new InMemoryLearnedHarnessRepository(),
      fakeSpaceContext()
    );
    expect(await useCase.execute({ repositoryPath: '  ' })).toBeNull();
  });
});
