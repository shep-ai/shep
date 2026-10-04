/** In-memory investigation repository for use-case tests (spec 123). */

import type { WorkItemInvestigation } from '@/domain/generated/output.js';
import type { IInvestigationRepository } from '@/application/ports/output/repositories/investigation-repository.interface.js';

export class InMemoryInvestigations implements IInvestigationRepository {
  readonly rows = new Map<string, WorkItemInvestigation>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async listByWorkItem(workItemId: string) {
    return [...this.rows.values()]
      .filter((row) => row.workItemId === workItemId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async create(investigation: WorkItemInvestigation) {
    this.rows.set(investigation.id, investigation);
  }
  async update(investigation: WorkItemInvestigation) {
    this.rows.set(investigation.id, investigation);
  }
}
