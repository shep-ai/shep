/**
 * Shared loader for the candidate memory set a repository's agents may see
 * (spec 120): the repository's own Project entries, its product line's
 * entries, and its space's space-wide entries (including legacy Organization
 * entries of that space), deduped by id.
 *
 * Every query is filtered by the resolved space or line, so no entry of
 * another space can reach a prompt. Entries promoted from this repository keep
 * its path, so the repository query contributes Project entries only: a
 * promoted entry is read through its own space or line, never by path.
 *
 * Used by ReadProjectMemoryUseCase (renders all) and SelectProjectMemoryUseCase
 * (ranks and budgets a relevant subset).
 */

import { MemoryScope, type ProjectMemory } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import type { SpaceContext } from '../spaces/resolve-space-context.use-case.js';

function isProjectScoped(entry: ProjectMemory): boolean {
  return (entry.scope ?? MemoryScope.Project) === MemoryScope.Project;
}

export async function loadCandidateMemory(
  memoryRepo: IProjectMemoryRepository,
  context: SpaceContext
): Promise<ProjectMemory[]> {
  const [projectEntries, lineEntries, spaceEntries] = await Promise.all([
    memoryRepo.listByRepository(context.repositoryPath),
    context.productLine
      ? memoryRepo.listProductLine(context.productLine.id)
      : Promise.resolve([] as ProjectMemory[]),
    memoryRepo.listSpaceWide(context.space.id),
  ]);

  const byId = new Map<string, ProjectMemory>();
  for (const entry of [
    ...projectEntries.filter(isProjectScoped),
    ...lineEntries,
    ...spaceEntries,
  ]) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}
