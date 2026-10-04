import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordProjectMemoryUseCase } from '@/application/use-cases/project-memory/record-project-memory.use-case.js';
import {
  createMockProjectMemoryRepository,
  DEFAULT_SPACE,
  type MockProjectMemoryRepository,
} from '../../../helpers/space-repositories.mock.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { SpaceResolutionSource } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';
import { MAX_CONTENT_LENGTH } from '@/application/use-cases/project-memory/project-memory.constants.js';

function resolverFor(productLineId?: string): ResolveSpaceContextUseCase {
  return {
    execute: vi.fn(async (repositoryPath: string) => ({
      repositoryPath,
      space: DEFAULT_SPACE,
      ...(productLineId
        ? {
            productLine: {
              id: productLineId,
              spaceId: DEFAULT_SPACE.id,
              name: 'Line',
              slug: 'line',
              createdAt: new Date(0),
              updatedAt: new Date(0),
            },
          }
        : {}),
      source: SpaceResolutionSource.Default,
    })),
  } as unknown as ResolveSpaceContextUseCase;
}

describe('RecordProjectMemoryUseCase', () => {
  let useCase: RecordProjectMemoryUseCase;
  let repo: MockProjectMemoryRepository;

  beforeEach(() => {
    repo = createMockProjectMemoryRepository();
    useCase = new RecordProjectMemoryUseCase(repo, resolverFor('line-1'));
  });

  it('upserts each entry and reports the recorded count', async () => {
    const result = await useCase.execute({
      repositoryPath: '/repo',
      sourceFeatureId: 'feat-1',
      entries: [
        { category: MemoryCategory.Convention, entryKey: 'k1', content: 'A.' },
        { category: MemoryCategory.Library, entryKey: 'k2', content: 'B.' },
      ],
    });

    expect(result.recorded).toBe(2);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: '/repo',
        category: MemoryCategory.Convention,
        entryKey: 'k1',
        content: 'A.',
        sourceFeatureId: 'feat-1',
        spaceId: DEFAULT_SPACE.id,
        productLineId: 'line-1',
      })
    );
  });

  it('generates a fresh id per entry', async () => {
    await useCase.execute({
      repositoryPath: '/repo',
      entries: [
        { category: MemoryCategory.Convention, entryKey: 'k1', content: 'A.' },
        { category: MemoryCategory.Convention, entryKey: 'k2', content: 'B.' },
      ],
    });
    const ids = repo.upsert.mock.calls.map(([arg]) => arg.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBeTruthy();
  });

  it('skips entries with blank entryKey or content', async () => {
    const result = await useCase.execute({
      repositoryPath: '/repo',
      entries: [
        { category: MemoryCategory.Convention, entryKey: '  ', content: 'no key' },
        { category: MemoryCategory.Convention, entryKey: 'k', content: '   ' },
        { category: MemoryCategory.Convention, entryKey: 'k2', content: 'kept' },
      ],
    });

    expect(result.recorded).toBe(1);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('trims and length-caps content', async () => {
    const long = 'x'.repeat(MAX_CONTENT_LENGTH + 50);
    await useCase.execute({
      repositoryPath: '/repo',
      entries: [{ category: MemoryCategory.Library, entryKey: 'k', content: `  ${long}  ` }],
    });

    const [arg] = repo.upsert.mock.calls[0];
    expect(arg.content.length).toBe(MAX_CONTENT_LENGTH);
  });

  it('records nothing for a blank repository path', async () => {
    const result = await useCase.execute({
      repositoryPath: '   ',
      entries: [{ category: MemoryCategory.Convention, entryKey: 'k', content: 'A.' }],
    });
    expect(result.recorded).toBe(0);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});
