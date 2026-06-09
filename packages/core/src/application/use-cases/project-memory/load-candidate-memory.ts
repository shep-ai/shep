/**
 * Shared loader for the candidate memory set a repository's agents may see:
 * the repository's own entries PLUS every organization-wide entry, deduped by id
 * (an org entry that originated in this repo must not be counted twice).
 *
 * Used by both ReadProjectMemoryUseCase (renders all) and
 * SelectProjectMemoryUseCase (ranks + budgets a relevant subset).
 */

import type { ProjectMemory } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';

export async function loadCandidateMemory(
  memoryRepo: IProjectMemoryRepository,
  repositoryPath: string
): Promise<ProjectMemory[]> {
  const [projectEntries, orgEntries] = await Promise.all([
    memoryRepo.listByRepository(repositoryPath),
    memoryRepo.listOrganization(),
  ]);

  const byId = new Map<string, ProjectMemory>();
  for (const entry of [...projectEntries, ...orgEntries]) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}
