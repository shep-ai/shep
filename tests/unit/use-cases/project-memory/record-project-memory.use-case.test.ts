import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordProjectMemoryUseCase } from '@/application/use-cases/project-memory/record-project-memory.use-case.js';
import type { IProjectMemoryRepository } from '@/application/ports/output/repositories/project-memory-repository.interface.js';
import { MemoryCategory } from '@/domain/generated/output.js';
import { MAX_CONTENT_LENGTH } from '@/application/use-cases/project-memory/project-memory.constants.js';

describe('RecordProjectMemoryUseCase', () => {
  let useCase: RecordProjectMemoryUseCase;
  let repo: IProjectMemoryRepository;

  beforeEach(() => {
    repo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByRepository: vi.fn(),
      listAll: vi.fn(),
      listOrganization: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
      updateContent: vi.fn(),
      updateScope: vi.fn(),
      delete: vi.fn(),
    };
    useCase = new RecordProjectMemoryUseCase(repo);
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
    const ids = vi.mocked(repo.upsert).mock.calls.map(([arg]) => arg.id);
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

    const [arg] = vi.mocked(repo.upsert).mock.calls[0];
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
