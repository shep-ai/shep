/**
 * Epic Repository Interface (Output Port)
 *
 * Defines the contract for Epic entity persistence operations.
 * Epics group related work items under a higher-level initiative.
 */

import type { Epic } from '../../../../domain/generated/output.js';

export interface IEpicRepository {
  /** Create a new epic record. */
  create(epic: Epic): Promise<void>;

  /** Find an epic by its unique ID (excludes soft-deleted). */
  findById(id: string): Promise<Epic | null>;

  /** List all non-deleted epics for a project. */
  listByProject(projectId: string): Promise<Epic[]>;

  /** Update mutable fields on an existing epic. */
  update(
    id: string,
    fields: Partial<Pick<Epic, 'name' | 'description' | 'status' | 'startDate' | 'endDate'>>
  ): Promise<void>;

  /** Soft-delete an epic by setting deletedAt timestamp. */
  softDelete(id: string): Promise<void>;

  /** Get the total and completed work item counts for an epic. */
  getWorkItemCount(epicId: string): Promise<{ total: number; completed: number }>;
}
