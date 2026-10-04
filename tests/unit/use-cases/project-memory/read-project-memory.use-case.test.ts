import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadProjectMemoryUseCase } from '@/application/use-cases/project-memory/read-project-memory.use-case.js';
import {
  createMockProjectMemoryRepository,
  DEFAULT_SPACE,
  type MockProjectMemoryRepository,
} from '../../../helpers/space-repositories.mock.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { MemoryScope, SpaceResolutionSource } from '@/domain/generated/output.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';

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

describe('ReadProjectMemoryUseCase', () => {
  let useCase: ReadProjectMemoryUseCase;
  let repo: MockProjectMemoryRepository;

  const NOW = new Date('2026-05-01T10:00:00Z');

  function entry(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
    return {
      id: overrides.id ?? 'id-1',
      repositoryPath: '/repo',
      category: MemoryCategory.Convention,
      entryKey: overrides.entryKey ?? 'k-1',
      content: 'Some memory.',
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = createMockProjectMemoryRepository();
    useCase = new ReadProjectMemoryUseCase(repo, resolverFor('line-1'));
  });

  it('returns an empty blob when the store is empty', async () => {
    const result = await useCase.execute({ repositoryPath: '/repo' });
    expect(result.blob).toBe('');
    expect(result.entryCount).toBe(0);
  });

  it('returns an empty blob for a blank repository path without querying', async () => {
    const result = await useCase.execute({ repositoryPath: '   ' });
    expect(result.blob).toBe('');
    expect(repo.listByRepository).not.toHaveBeenCalled();
  });

  it('renders entries grouped into labelled, ordered category sections', async () => {
    repo.listByRepository.mockResolvedValue([
      entry({ id: 'c1', category: MemoryCategory.Convention, content: 'Use use-cases only.' }),
      entry({ id: 'l1', category: MemoryCategory.Library, content: 'Prefer better-sqlite3.' }),
      entry({
        id: 'a1',
        category: MemoryCategory.ArchitectureDecision,
        content: 'All agent calls via IAgentExecutorProvider.',
      }),
    ]);

    const { blob } = await useCase.execute({ repositoryPath: '/repo' });

    expect(blob).toContain('### Conventions');
    expect(blob).toContain('- Use use-cases only.');
    expect(blob).toContain('### Architecture Decisions');
    expect(blob).toContain('### Preferred Libraries & Tools');
    // Conventions section precedes Architecture which precedes Libraries.
    expect(blob.indexOf('### Conventions')).toBeLessThan(
      blob.indexOf('### Architecture Decisions')
    );
    expect(blob.indexOf('### Architecture Decisions')).toBeLessThan(
      blob.indexOf('### Preferred Libraries & Tools')
    );
  });

  it('caps the number of entries rendered per category', async () => {
    const many: ProjectMemory[] = Array.from({ length: 20 }, (_, i) =>
      entry({ id: `k${i}`, entryKey: `k${i}`, content: `Convention ${i}` })
    );
    repo.listByRepository.mockResolvedValue(many);

    const { blob } = await useCase.execute({ repositoryPath: '/repo' });
    const bulletCount = blob.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(bulletCount).toBe(12); // MAX_ENTRIES_PER_CATEGORY
  });

  it('merges product-line and space-wide entries of the resolved space with the project entries', async () => {
    repo.listByRepository.mockResolvedValue([
      entry({ id: 'p1', category: MemoryCategory.Convention, content: 'Project convention.' }),
    ]);
    repo.listProductLine.mockResolvedValue([
      entry({ id: 'l1', scope: MemoryScope.ProductLine, content: 'Line rule.' }),
    ]);
    repo.listSpaceWide.mockResolvedValue([
      entry({
        id: 's1',
        category: MemoryCategory.Library,
        scope: MemoryScope.Space,
        content: 'Space-wide library choice.',
      }),
    ]);

    const { blob, entryCount } = await useCase.execute({ repositoryPath: '/repo' });

    expect(repo.listSpaceWide).toHaveBeenCalledWith(DEFAULT_SPACE.id);
    expect(repo.listProductLine).toHaveBeenCalledWith('line-1');
    expect(blob).toContain('Project convention.');
    expect(blob).toContain('Line rule.');
    expect(blob).toContain('Space-wide library choice.');
    expect(entryCount).toBe(3);
  });

  it('takes only Project entries from the repository list, so a promoted entry follows its space', async () => {
    repo.listByRepository.mockResolvedValue([
      entry({ id: 'p1', content: 'Project convention.' }),
      entry({
        id: 'old-space',
        scope: MemoryScope.Space,
        spaceId: 'previous-space',
        content: 'Old space rule.',
      }),
    ]);

    const { blob, entryCount } = await useCase.execute({ repositoryPath: '/repo' });

    expect(blob).not.toContain('Old space rule.');
    expect(entryCount).toBe(1);
  });

  it('dedupes an entry returned by two queries', async () => {
    const shared = entry({ id: 'dup', category: MemoryCategory.Library, content: 'Shared.' });
    repo.listByRepository.mockResolvedValue([shared]);
    repo.listSpaceWide.mockResolvedValue([shared]);

    const { entryCount } = await useCase.execute({ repositoryPath: '/repo' });
    expect(entryCount).toBe(1);
  });

  it('omits categories that have no entries', async () => {
    repo.listByRepository.mockResolvedValue([
      entry({ category: MemoryCategory.CiFixResolution, content: 'npm >= 11.5 on runner.' }),
    ]);

    const { blob } = await useCase.execute({ repositoryPath: '/repo' });
    expect(blob).toContain('### Past CI/Build Fixes');
    expect(blob).not.toContain('### Conventions');
  });
});
