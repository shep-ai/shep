/**
 * IntakeItem Repository Interface (Output Port)
 *
 * Defines the contract for IntakeItem entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 */

import type { IntakeItem } from '../../../../domain/generated/output.js';

export interface IIntakeItemRepository {
  create(item: IntakeItem): Promise<void>;
  findById(id: string): Promise<IntakeItem | null>;
  listByProject(projectId: string, status?: string): Promise<IntakeItem[]>;
  update(
    id: string,
    fields: Partial<
      Pick<
        IntakeItem,
        | 'status'
        | 'triageNotes'
        | 'suggestedStateId'
        | 'suggestedPriority'
        | 'suggestedLabels'
        | 'suggestedAssigneeId'
        | 'resultingWorkItemId'
        | 'declineReason'
        | 'duplicateOfWorkItemId'
      >
    >
  ): Promise<void>;
  softDelete(id: string): Promise<void>;
}
