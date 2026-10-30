import { describe, it, expect } from 'vitest';
import { resolveHarnessVersion } from '@/application/use-cases/harness-learning/resolve-harness-version.js';
import { InMemoryLearnedHarnessRepository } from '../../../../helpers/harness-learning.fakes.js';
import {
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

const v = (id: string): LearnedHarnessVersion => ({
  id,
  scope: MemoryScope.Project,
  repositoryPath: '/r',
  status: LearnedHarnessStatus.Candidate,
  origin: HarnessOrigin.Manual,
  components: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('resolveHarnessVersion', () => {
  it('finds a version by its full id or a unique prefix, never an ambiguous one', async () => {
    const repo = new InMemoryLearnedHarnessRepository();
    await repo.createVersion(v('abc123'));
    await repo.createVersion(v('abd456'));
    expect((await resolveHarnessVersion(repo, 'abc123'))?.id).toBe('abc123');
    expect((await resolveHarnessVersion(repo, 'abd'))?.id).toBe('abd456');
    expect(await resolveHarnessVersion(repo, 'ab')).toBeNull();
    expect(await resolveHarnessVersion(repo, 'zz')).toBeNull();
    expect(await resolveHarnessVersion(repo, '')).toBeNull();
  });
});
