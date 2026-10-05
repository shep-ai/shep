import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectProjectMemoryUseCase } from '@/application/use-cases/project-memory/select-project-memory.use-case.js';
import {
  createMockProjectMemoryRepository,
  DEFAULT_SPACE,
  type MockProjectMemoryRepository,
} from '../../../helpers/space-repositories.mock.js';
import type { SelectKnowledgeUseCase } from '@/application/use-cases/knowledge/select-knowledge.use-case.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { MemoryScope, SpaceResolutionSource } from '@/domain/generated/output.js';
import type { IMemoryRelevanceScorer } from '@/application/ports/output/services/memory-relevance-scorer.interface.js';
import type { ProjectMemory, Space } from '@/domain/generated/output.js';
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

function resolverFor(
  productLineId?: string,
  space: Space = DEFAULT_SPACE
): ResolveSpaceContextUseCase {
  return {
    execute: vi.fn(async (repositoryPath: string) => ({
      repositoryPath,
      space,
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

describe('SelectProjectMemoryUseCase', () => {
  let repo: MockProjectMemoryRepository;
  let scorer: IMemoryRelevanceScorer;
  let useCase: SelectProjectMemoryUseCase;
  let knowledge: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = createMockProjectMemoryRepository();
    // Identity scorer: preserves input order with descending scores.
    scorer = {
      score: vi.fn(async (_q, entries: ProjectMemory[]) =>
        entries.map((e, i) => ({ entry: e, score: 1 - i * 0.01 }))
      ),
    };
    knowledge = { execute: vi.fn(async () => ({ blob: '', passages: [] })) };
    useCase = new SelectProjectMemoryUseCase(
      repo,
      scorer,
      resolverFor(),
      knowledge as unknown as SelectKnowledgeUseCase
    );
  });

  it('returns an empty blob for a blank repository path without querying', async () => {
    const result = await useCase.execute({ repositoryPath: '  ' });
    expect(result.blob).toBe('');
    expect(repo.listByRepository).not.toHaveBeenCalled();
  });

  it('returns an empty blob when the store is empty', async () => {
    const result = await useCase.execute({ repositoryPath: '/repo' });
    expect(result).toEqual({ blob: '', selectedCount: 0, totalCount: 0, knowledgeCount: 0 });
  });

  it('merges repo + space-wide candidates and passes them to the scorer', async () => {
    repo.listByRepository.mockResolvedValue([entry({ id: 'p', entryKey: 'p' })]);
    repo.listSpaceWide.mockResolvedValue([
      entry({ id: 'o', entryKey: 'o', scope: MemoryScope.Space }),
    ]);

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
    repo.listByRepository.mockResolvedValue(entries);

    const result = await useCase.execute({ repositoryPath: '/repo', tokenBudget: 40 }); // 160 chars
    expect(result.totalCount).toBe(5);
    expect(result.selectedCount).toBeGreaterThan(0);
    expect(result.selectedCount).toBeLessThan(5);
  });

  it('always includes at least the single most relevant entry', async () => {
    repo.listByRepository.mockResolvedValue([entry({ id: 'big', content: 'y'.repeat(5000) })]);
    const result = await useCase.execute({ repositoryPath: '/repo', tokenBudget: 1 });
    expect(result.selectedCount).toBe(1);
    expect(result.blob).toContain('y'.repeat(50));
  });

  it('adds the team knowledge relevant to the task after the memory (spec 125)', async () => {
    repo.listByRepository.mockResolvedValue([
      entry({ id: 'p', entryKey: 'p', content: 'Use zod.' }),
    ]);
    knowledge.execute.mockResolvedValue({
      blob: '### Team knowledge\n\nFrom Refunds (u):\nGuests by email.',
      passages: [{ title: 'Refunds', url: 'u', text: 'Guests by email.' }],
    });
    const result = await useCase.execute({ repositoryPath: '/repo', taskText: 'refund guests' });
    expect(knowledge.execute).toHaveBeenCalledWith({
      repositoryPath: '/repo',
      taskText: 'refund guests',
    });
    expect(result.blob).toMatch(/Use zod\.[\s\S]*### Team knowledge/);
    expect(result.knowledgeCount).toBe(1);
  });

  it('gives knowledge alone when there is no memory yet', async () => {
    knowledge.execute.mockResolvedValue({ blob: '### Team knowledge\n\nx', passages: [{}] });
    const result = await useCase.execute({ repositoryPath: '/repo', taskText: 't' });
    expect(result).toEqual({
      blob: '### Team knowledge\n\nx',
      selectedCount: 0,
      totalCount: 0,
      knowledgeCount: 1,
    });
  });

  it('tells the plan and implement phases to write docs first in a docs-first space (spec 131)', async () => {
    const docsFirst: Space = {
      ...DEFAULT_SPACE,
      agentSettings: { docsFirst: true, docsPaths: ['guide/'] },
    };
    useCase = new SelectProjectMemoryUseCase(
      repo,
      scorer,
      resolverFor(undefined, docsFirst),
      knowledge as unknown as SelectKnowledgeUseCase
    );
    const plan = await useCase.execute({ repositoryPath: '/repo', phase: 'plan', taskText: 't' });
    expect(plan.blob).toContain('### Docs first');
    expect(plan.blob).toContain('guide/');
    const research = await useCase.execute({
      repositoryPath: '/repo',
      phase: 'research',
      taskText: 't',
    });
    expect(research.blob).toBe('');
  });

  it('adds nothing about docs where the space does not ask for it', async () => {
    const result = await useCase.execute({ repositoryPath: '/repo', phase: 'plan', taskText: 't' });
    expect(result.blob).not.toContain('Docs first');
  });
});
