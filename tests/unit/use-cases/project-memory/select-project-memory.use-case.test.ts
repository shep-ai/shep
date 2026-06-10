import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectProjectMemoryUseCase } from '@/application/use-cases/project-memory/select-project-memory.use-case.js';
import type { IProjectMemoryRepository } from '@/application/ports/output/repositories/project-memory-repository.interface.js';
import type { IMemoryRelevanceScorer } from '@/application/ports/output/services/memory-relevance-scorer.interface.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';

function entry(over: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: 'id',
    repositoryPath: '/repo',
    category: MemoryCategory.Convention,
    entryKey: 'k',
    content: 'content',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

describe('SelectProjectMemoryUseCase', () => {
  let repo: IProjectMemoryRepository;
  let scorer: IMemoryRelevanceScorer;
  let useCase: SelectProjectMemoryUseCase;

  beforeEach(() => {
    repo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByRepository: vi.fn().mockResolvedValue([]),
      listAll: vi.fn(),
      listOrganization: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      updateContent: vi.fn(),
      updateScope: vi.fn(),
      delete: vi.fn(),
    };
    // Identity scorer: preserves input order with descending scores.
    scorer = {
      score: vi.fn(async (_q, entries: ProjectMemory[]) =>
        entries.map((e, i) => ({ entry: e, score: 1 - i * 0.01 }))
      ),
    };
    useCase = new SelectProjectMemoryUseCase(repo, scorer);
  });

  it('returns an empty blob for a blank repository path without querying', async () => {
    const result = await useCase.execute({ repositoryPath: '  ' });
    expect(result.blob).toBe('');
    expect(repo.listByRepository).not.toHaveBeenCalled();
  });

  it('returns an empty blob when the store is empty', async () => {
    const result = await useCase.execute({ repositoryPath: '/repo' });
    expect(result).toEqual({ blob: '', selectedCount: 0, totalCount: 0 });
  });

  it('merges repo + organization candidates and passes them to the scorer', async () => {
    vi.mocked(repo.listByRepository).mockResolvedValue([entry({ id: 'p', entryKey: 'p' })]);
    vi.mocked(repo.listOrganization).mockResolvedValue([entry({ id: 'o', entryKey: 'o' })]);

    await useCase.execute({ repositoryPath: '/repo', phase: 'implement', taskText: 'task' });

    expect(scorer.score).toHaveBeenCalledWith(
      { taskText: 'task', phase: 'implement' },
      expect.arrayContaining([
        expect.objectContaining({ id: 'p' }),
        expect.objectContaining({ id: 'o' }),
      ])
    );
  });

  it('includes only the top entries that fit the token budget', async () => {
    // 5 entries of ~80 chars each; a tiny budget admits only the first couple.
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `e${i}`, entryKey: `e${i}`, content: 'x'.repeat(80) })
    );
    vi.mocked(repo.listByRepository).mockResolvedValue(entries);

    const result = await useCase.execute({ repositoryPath: '/repo', tokenBudget: 40 }); // 160 chars
    expect(result.totalCount).toBe(5);
    expect(result.selectedCount).toBeGreaterThan(0);
    expect(result.selectedCount).toBeLessThan(5);
  });

  it('always includes at least the single most relevant entry', async () => {
    vi.mocked(repo.listByRepository).mockResolvedValue([
      entry({ id: 'big', content: 'y'.repeat(5000) }),
    ]);
    const result = await useCase.execute({ repositoryPath: '/repo', tokenBudget: 1 });
    expect(result.selectedCount).toBe(1);
    expect(result.blob).toContain('y'.repeat(50));
  });
});
