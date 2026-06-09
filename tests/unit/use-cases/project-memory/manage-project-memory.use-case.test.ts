import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageProjectMemoryUseCase } from '@/application/use-cases/project-memory/manage-project-memory.use-case.js';
import type { IProjectMemoryRepository } from '@/application/ports/output/repositories/project-memory-repository.interface.js';
import type { ProjectMemory } from '@/domain/generated/output.js';
import { MemoryCategory, MemoryScope } from '@/domain/generated/output.js';
import { MAX_CONTENT_LENGTH } from '@/application/use-cases/project-memory/project-memory.constants.js';

describe('ManageProjectMemoryUseCase', () => {
  let useCase: ManageProjectMemoryUseCase;
  let repo: IProjectMemoryRepository;

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
    repo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(entry),
      listByRepository: vi.fn().mockResolvedValue([entry]),
      listAll: vi.fn().mockResolvedValue([entry]),
      listOrganization: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      updateContent: vi.fn().mockResolvedValue(undefined),
      updateScope: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ManageProjectMemoryUseCase(repo);
  });

  describe('list()', () => {
    it('lists all entries when no repository path is given', async () => {
      await useCase.list();
      expect(repo.listAll).toHaveBeenCalled();
      expect(repo.listByRepository).not.toHaveBeenCalled();
    });

    it('scopes to a repository when a path is given', async () => {
      await useCase.list('/repo');
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
      vi.mocked(repo.findById).mockResolvedValue(null);
      const result = await useCase.update('missing', 'x');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('not found');
    });

    it('length-caps content', async () => {
      await useCase.update('m1', 'x'.repeat(MAX_CONTENT_LENGTH + 50));
      const [, content] = vi.mocked(repo.updateContent).mock.calls[0];
      expect(content.length).toBe(MAX_CONTENT_LENGTH);
    });
  });

  describe('setScope()', () => {
    it('promotes an entry to organization scope', async () => {
      const result = await useCase.setScope('m1', MemoryScope.Organization);
      expect(result.ok).toBe(true);
      expect(repo.updateScope).toHaveBeenCalledWith('m1', MemoryScope.Organization);
      if (result.ok) expect(result.memory.scope).toBe(MemoryScope.Organization);
    });

    it('rejects an unknown id', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null);
      const result = await useCase.setScope('missing', MemoryScope.Organization);
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
