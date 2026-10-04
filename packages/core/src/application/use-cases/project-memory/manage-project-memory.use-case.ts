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
import { MemoryScope, type ProjectMemory } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import { MAX_CONTENT_LENGTH } from './project-memory.constants.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

export interface ListProjectMemoryFilter {
  /** Only this repository's entries. */
  repositoryPath?: string;
  /** Only entries of this space. Ignored when repositoryPath is given. */
  spaceId?: string;
}

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
    private readonly memoryRepo: IProjectMemoryRepository,
    @inject(ResolveSpaceContextUseCase)
    private readonly resolveSpaceContext: ResolveSpaceContextUseCase
  ) {}

  /**
   * List memory entries for the management view: one repository's, one
   * space's, or (with no filter) every entry.
   */
  async list(filter: ListProjectMemoryFilter = {}): Promise<ProjectMemory[]> {
    const repositoryPath = filter.repositoryPath?.trim();
    if (repositoryPath) return this.memoryRepo.listByRepository(repositoryPath);
    const spaceId = filter.spaceId?.trim();
    return this.memoryRepo.listAll(spaceId === '' ? undefined : spaceId);
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
   * Change an entry's scope: keep it on its repository (Project), share it with
   * the repository's product line (ProductLine), or with its whole space
   * (Space). The entry is placed in the space and line its repository resolves
   * to now. The legacy Organization scope is read-only.
   */
  async setScope(id: string, scope: MemoryScope): Promise<SetProjectMemoryScopeResult> {
    const trimmedId = id?.trim();
    if (!trimmedId) return { ok: false, error: 'Memory id is required.' };

    if (scope === MemoryScope.Organization) {
      return { ok: false, error: 'Organization is a legacy scope. Use Space instead.' };
    }

    const existing = await this.memoryRepo.findById(trimmedId);
    if (!existing) return { ok: false, error: `Memory not found: "${trimmedId}"` };

    const context = await this.resolveSpaceContext.execute(existing.repositoryPath);
    if (scope === MemoryScope.ProductLine && !context.productLine) {
      return {
        ok: false,
        error: `${existing.repositoryPath} is not in a product line. Add it to one on the Spaces page first.`,
      };
    }

    const placement = {
      spaceId: context.space.id,
      ...(context.productLine ? { productLineId: context.productLine.id } : {}),
    };
    await this.memoryRepo.updateScope(trimmedId, scope, placement);
    const { productLineId: _previousLine, ...unplaced } = existing;
    return {
      ok: true,
      memory: { ...unplaced, scope, ...placement, updatedAt: new Date() },
    };
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
