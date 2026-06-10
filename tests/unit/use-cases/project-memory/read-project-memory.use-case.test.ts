import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadProjectMemoryUseCase } from '@/application/use-cases/project-memory/read-project-memory.use-case.js';
import type { IProjectMemoryRepository } from '@/application/ports/output/repositories/project-memory-repository.interface.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory } from '@/domain/generated/output.js';

describe('ReadProjectMemoryUseCase', () => {
  let useCase: ReadProjectMemoryUseCase;
  let repo: IProjectMemoryRepository;

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
    repo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByRepository: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      listOrganization: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      updateContent: vi.fn(),
      updateScope: vi.fn(),
      delete: vi.fn(),
    };
    useCase = new ReadProjectMemoryUseCase(repo);
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
    vi.mocked(repo.listByRepository).mockResolvedValue([
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
    vi.mocked(repo.listByRepository).mockResolvedValue(many);

    const { blob } = await useCase.execute({ repositoryPath: '/repo' });
    const bulletCount = blob.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(bulletCount).toBe(12); // MAX_ENTRIES_PER_CATEGORY
  });

  it('merges organization-wide entries in with the project entries', async () => {
    vi.mocked(repo.listByRepository).mockResolvedValue([
      entry({ id: 'p1', category: MemoryCategory.Convention, content: 'Project convention.' }),
    ]);
    vi.mocked(repo.listOrganization).mockResolvedValue([
      entry({ id: 'o1', category: MemoryCategory.Library, content: 'Org-wide library choice.' }),
    ]);

    const { blob, entryCount } = await useCase.execute({ repositoryPath: '/repo' });

    expect(blob).toContain('Project convention.');
    expect(blob).toContain('Org-wide library choice.');
    expect(entryCount).toBe(2);
  });

  it('dedupes an org entry that also appears in the project list', async () => {
    const shared = entry({ id: 'dup', category: MemoryCategory.Library, content: 'Shared.' });
    vi.mocked(repo.listByRepository).mockResolvedValue([shared]);
    vi.mocked(repo.listOrganization).mockResolvedValue([shared]);

    const { entryCount } = await useCase.execute({ repositoryPath: '/repo' });
    expect(entryCount).toBe(1);
  });

  it('omits categories that have no entries', async () => {
    vi.mocked(repo.listByRepository).mockResolvedValue([
      entry({ category: MemoryCategory.CiFixResolution, content: 'npm >= 11.5 on runner.' }),
    ]);

    const { blob } = await useCase.execute({ repositoryPath: '/repo' });
    expect(blob).toContain('### Past CI/Build Fixes');
    expect(blob).not.toContain('### Conventions');
  });
});
