/**
 * ManageProjectMemoryUseCase
 *
 * Read/write management surface for project memory ("Shep Brain"), backing the
 * web management UI. Lists entries (all repositories or one), edits an entry's
 * content, and deletes entries. Distinct from ReadProjectMemoryUseCase (which
 * renders the prompt blob for agents) and RecordProjectMemoryUseCase (which the
 * post-merge extraction node uses to upsert).
 *
 * Presentation-agnostic: returns plain entities / result objects the CLI, TUI,
 * or web can consume.
 */

import { injectable, inject } from 'tsyringe';
import type { ProjectMemory, MemoryScope } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import { MAX_CONTENT_LENGTH } from './project-memory.constants.js';

export type UpdateProjectMemoryResult =
  | { ok: true; memory: ProjectMemory }
  | { ok: false; error: string };

export type DeleteProjectMemoryResult = { ok: true } | { ok: false; error: string };

export type SetProjectMemoryScopeResult =
  | { ok: true; memory: ProjectMemory }
  | { ok: false; error: string };

@injectable()
export class ManageProjectMemoryUseCase {
  constructor(
    @inject('IProjectMemoryRepository')
    private readonly memoryRepo: IProjectMemoryRepository
  ) {}

  /**
   * List memory entries. Without a repositoryPath, returns every entry across
   * all repositories (for the global management view); with one, scopes to it.
   */
  async list(repositoryPath?: string): Promise<ProjectMemory[]> {
    const scoped = repositoryPath?.trim();
    return scoped ? this.memoryRepo.listByRepository(scoped) : this.memoryRepo.listAll();
  }

  /**
   * Update an entry's content. Trims and length-caps the new content; rejects
   * empty content or an unknown id.
   */
  async update(id: string, content: string): Promise<UpdateProjectMemoryResult> {
    const trimmedId = id?.trim();
    if (!trimmedId) return { ok: false, error: 'Memory id is required.' };

    const trimmed = content?.trim();
    if (!trimmed) return { ok: false, error: 'Memory content cannot be empty.' };

    const existing = await this.memoryRepo.findById(trimmedId);
    if (!existing) return { ok: false, error: `Memory not found: "${trimmedId}"` };

    const capped = trimmed.slice(0, MAX_CONTENT_LENGTH);
    await this.memoryRepo.updateContent(trimmedId, capped);

    return { ok: true, memory: { ...existing, content: capped, updatedAt: new Date() } };
  }

  /**
   * Change an entry's scope — promote a project learning to organization-wide
   * (read by every project's agents) or demote it back to project-only.
   */
  async setScope(id: string, scope: MemoryScope): Promise<SetProjectMemoryScopeResult> {
    const trimmedId = id?.trim();
    if (!trimmedId) return { ok: false, error: 'Memory id is required.' };

    const existing = await this.memoryRepo.findById(trimmedId);
    if (!existing) return { ok: false, error: `Memory not found: "${trimmedId}"` };

    await this.memoryRepo.updateScope(trimmedId, scope);
    return { ok: true, memory: { ...existing, scope, updatedAt: new Date() } };
  }

  /**
   * Delete an entry by id.
   */
  async delete(id: string): Promise<DeleteProjectMemoryResult> {
    const trimmedId = id?.trim();
    if (!trimmedId) return { ok: false, error: 'Memory id is required.' };

    await this.memoryRepo.delete(trimmedId);
    return { ok: true };
  }
}
