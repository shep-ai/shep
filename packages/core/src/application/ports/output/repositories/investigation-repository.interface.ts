/** Work item investigation repository (spec 123). */

import type { WorkItemInvestigation } from '../../../../domain/generated/output.js';

export interface IInvestigationRepository {
  findById(id: string): Promise<WorkItemInvestigation | null>;
  /** A work item's investigations, newest first. */
  listByWorkItem(workItemId: string): Promise<WorkItemInvestigation[]>;
  create(investigation: WorkItemInvestigation): Promise<void>;
  update(investigation: WorkItemInvestigation): Promise<void>;
}
