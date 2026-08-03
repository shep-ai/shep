/**
 * DiscoverImportCandidatesUseCase Unit Tests
 *
 * TDD Phase: RED — written before the use case exists.
 *
 * Spec 105 resolved decision: list EVERY immediate subfolder and annotate it;
 * filter nothing on the user's behalf.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoverImportCandidatesUseCase } from '@/application/use-cases/repositories/discover-import-candidates.use-case.js';
import type { IRepositoryDiscoveryService } from '@/application/ports/output/services/repository-discovery-service.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { Repository } from '@/domain/generated/output.js';

function makeRepository(path: string, deletedAt?: Date): Repository {
  return {
    id: `repo-${path}`,
    name: path.split('/').pop() ?? path,
    path,
    bedrockEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...(deletedAt ? { deletedAt } : {}),
  };
}

describe('DiscoverImportCandidatesUseCase', () => {
  let discovery: IRepositoryDiscoveryService;
  let repositories: IRepositoryRepository;
  let useCase: DiscoverImportCandidatesUseCase;

  beforeEach(() => {
    discovery = {
      listSubdirectories: vi.fn().mockResolvedValue([]),
    };
    repositories = {
      findByPath: vi.fn().mockResolvedValue(null),
      findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
    } as unknown as IRepositoryRepository;

    useCase = new DiscoverImportCandidatesUseCase(discovery, repositories);
  });

  it('returns every immediate subfolder without filtering', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([
      { name: 'git-project', path: '/code/git-project', isGitRepository: true },
      { name: 'plain-folder', path: '/code/plain-folder', isGitRepository: false },
    ]);

    const result = await useCase.execute({ directoryPath: '/code' });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.name)).toEqual(['git-project', 'plain-folder']);
  });

  it('annotates each candidate with isGitRepository', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([
      { name: 'git-project', path: '/code/git-project', isGitRepository: true },
      { name: 'plain-folder', path: '/code/plain-folder', isGitRepository: false },
    ]);

    const result = await useCase.execute({ directoryPath: '/code' });
    const byName = new Map(result.candidates.map((c) => [c.name, c]));

    expect(byName.get('git-project')?.isGitRepository).toBe(true);
    expect(byName.get('plain-folder')?.isGitRepository).toBe(false);
  });

  it('marks candidates already tracked by shep', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([
      { name: 'tracked', path: '/code/tracked', isGitRepository: true },
      { name: 'untracked', path: '/code/untracked', isGitRepository: true },
    ]);
    vi.mocked(repositories.findByPath).mockImplementation(async (path: string) =>
      path === '/code/tracked' ? makeRepository('/code/tracked') : null
    );

    const result = await useCase.execute({ directoryPath: '/code' });
    const byName = new Map(result.candidates.map((c) => [c.name, c]));

    expect(byName.get('tracked')?.alreadyTracked).toBe(true);
    expect(byName.get('untracked')?.alreadyTracked).toBe(false);
  });

  it('reports a soft-deleted repository as restorable rather than tracked', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([
      { name: 'deleted', path: '/code/deleted', isGitRepository: true },
    ]);
    vi.mocked(repositories.findByPath).mockResolvedValue(null);
    vi.mocked(repositories.findByPathIncludingDeleted).mockResolvedValue(
      makeRepository('/code/deleted', new Date('2026-02-01T00:00:00Z'))
    );

    const result = await useCase.execute({ directoryPath: '/code' });

    expect(result.candidates[0].alreadyTracked).toBe(false);
    expect(result.candidates[0].previouslyRemoved).toBe(true);
  });

  it('normalizes the lookup path so annotations match what import will do', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([
      { name: 'proj', path: '/code/proj/', isGitRepository: true },
    ]);

    await useCase.execute({ directoryPath: '/code' });

    // Trailing slash must be stripped before the repository lookup, otherwise
    // an already-tracked repo would be annotated as new.
    expect(repositories.findByPath).toHaveBeenCalledWith('/code/proj');
  });

  it('rejects a relative directory path', async () => {
    await expect(useCase.execute({ directoryPath: 'relative/dir' })).rejects.toThrow(/absolute/i);
    expect(discovery.listSubdirectories).not.toHaveBeenCalled();
  });

  it('accepts a Windows drive-letter path', async () => {
    // CI runs on windows-latest; normalizePath yields "C:/Users/..." which is
    // absolute but does not start with "/".
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([]);

    await expect(useCase.execute({ directoryPath: 'C:\\Users\\dev\\Code' })).resolves.toMatchObject(
      { directoryPath: 'C:/Users/dev/Code' }
    );
    expect(discovery.listSubdirectories).toHaveBeenCalledWith('C:/Users/dev/Code');
  });

  it('returns an empty candidate list for an empty directory', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([]);

    const result = await useCase.execute({ directoryPath: '/code' });

    expect(result.candidates).toEqual([]);
  });

  it('echoes back the resolved directory it scanned', async () => {
    vi.mocked(discovery.listSubdirectories).mockResolvedValue([]);

    const result = await useCase.execute({ directoryPath: '/code/' });

    expect(result.directoryPath).toBe('/code');
  });
});
