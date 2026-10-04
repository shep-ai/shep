import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageProjectMemoryUseCase } from '@/application/use-cases/project-memory/manage-project-memory.use-case.js';
import {
  createMockProjectMemoryRepository,
  DEFAULT_SPACE,
  type MockProjectMemoryRepository,
} from '../../../helpers/space-repositories.mock.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { SpaceResolutionSource } from '@/domain/generated/output.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory, MemoryScope } from '@/domain/generated/output.js';
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

describe('ManageProjectMemoryUseCase', () => {
  let useCase: ManageProjectMemoryUseCase;
  let repo: MockProjectMemoryRepository;
  let resolver: ResolveSpaceContextUseCase;

  const NOW = new Date('2026-05-01T10:00:00Z');
  const entry: ProjectMemory = {
    id: 'm1',
    repositoryPath: '/repo',
    category: MemoryCategory.Convention,
    entryKey: 'k1',
    content: 'Original.',
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    repo = createMockProjectMemoryRepository({
      findById: vi.fn().mockResolvedValue(entry),
      listByRepository: vi.fn().mockResolvedValue([entry]),
      listAll: vi.fn().mockResolvedValue([entry]),
    });
    resolver = resolverFor('line-1');
    useCase = new ManageProjectMemoryUseCase(repo, resolver);
  });

  describe('list()', () => {
    it('lists all entries when no filter is given', async () => {
      await useCase.list();
      expect(repo.listAll).toHaveBeenCalledWith(undefined);
      expect(repo.listByRepository).not.toHaveBeenCalled();
    });

    it('lists one space when a space id is given', async () => {
      await useCase.list({ spaceId: 'space-a' });
      expect(repo.listAll).toHaveBeenCalledWith('space-a');
    });

    it('scopes to a repository when a path is given', async () => {
      await useCase.list({ repositoryPath: '/repo' });
      expect(repo.listByRepository).toHaveBeenCalledWith('/repo');
      expect(repo.listAll).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('updates content and returns the updated entry', async () => {
      const result = await useCase.update('m1', '  New guidance.  ');
      expect(result.ok).toBe(true);
      expect(repo.updateContent).toHaveBeenCalledWith('m1', 'New guidance.');
      if (result.ok) expect(result.memory.content).toBe('New guidance.');
    });

    it('rejects empty content', async () => {
      const result = await useCase.update('m1', '   ');
      expect(result.ok).toBe(false);
      expect(repo.updateContent).not.toHaveBeenCalled();
    });

    it('rejects an unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      const result = await useCase.update('missing', 'x');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('not found');
    });

    it('length-caps content', async () => {
      await useCase.update('m1', 'x'.repeat(MAX_CONTENT_LENGTH + 50));
      const [, content] = repo.updateContent.mock.calls[0];
      expect(content.length).toBe(MAX_CONTENT_LENGTH);
    });
  });

  describe('setScope()', () => {
    it('promotes an entry to its space, placing it in the repository space', async () => {
      const result = await useCase.setScope('m1', MemoryScope.Space);
      expect(result.ok).toBe(true);
      expect(resolver.execute).toHaveBeenCalledWith('/repo');
      expect(repo.updateScope).toHaveBeenCalledWith('m1', MemoryScope.Space, {
        spaceId: DEFAULT_SPACE.id,
        productLineId: 'line-1',
      });
      if (result.ok) expect(result.memory.scope).toBe(MemoryScope.Space);
    });

    it('promotes an entry to its product line', async () => {
      const result = await useCase.setScope('m1', MemoryScope.ProductLine);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.memory.productLineId).toBe('line-1');
    });

    it('refuses a product-line scope when the repository has no product line', async () => {
      useCase = new ManageProjectMemoryUseCase(repo, resolverFor());
      const result = await useCase.setScope('m1', MemoryScope.ProductLine);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('product line');
      expect(repo.updateScope).not.toHaveBeenCalled();
    });

    it('clears a stale product line when the repository no longer has one', async () => {
      repo.findById.mockResolvedValue({ ...entry, productLineId: 'old-line' });
      useCase = new ManageProjectMemoryUseCase(repo, resolverFor());
      const result = await useCase.setScope('m1', MemoryScope.Space);
      expect(repo.updateScope).toHaveBeenCalledWith('m1', MemoryScope.Space, {
        spaceId: DEFAULT_SPACE.id,
      });
      if (result.ok) expect(result.memory.productLineId).toBeUndefined();
    });

    it('refuses the legacy Organization scope for new writes', async () => {
      const result = await useCase.setScope('m1', MemoryScope.Organization);
      expect(result.ok).toBe(false);
      expect(repo.updateScope).not.toHaveBeenCalled();
    });

    it('rejects an unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      const result = await useCase.setScope('missing', MemoryScope.Space);
      expect(result.ok).toBe(false);
      expect(repo.updateScope).not.toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('deletes by id', async () => {
      const result = await useCase.delete('m1');
      expect(result.ok).toBe(true);
      expect(repo.delete).toHaveBeenCalledWith('m1');
    });

    it('rejects a blank id', async () => {
      const result = await useCase.delete('  ');
      expect(result.ok).toBe(false);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
