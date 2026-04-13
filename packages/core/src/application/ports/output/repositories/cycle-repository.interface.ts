/**
 * Cycle Repository Interface (Output Port)
 *
 * Defines the contract for Cycle entity persistence operations.
 * Includes junction table operations for cycle-work item associations.
 */

import type { Cycle } from '../../../../domain/generated/output.js';

export interface ICycleRepository {
  /** Create a new cycle record. */
  create(cycle: Cycle): Promise<void>;

  /** Find a cycle by its unique ID (excludes soft-deleted). */
  findById(id: string): Promise<Cycle | null>;

  /** List all non-deleted cycles for a project, ordered by start date. */
  listByProject(projectId: string): Promise<Cycle[]>;

  /** Find the currently active cycle for a project (status = Active). */
  findActiveByProject(projectId: string): Promise<Cycle | null>;

  /** Update mutable fields on an existing cycle. */
  update(
    id: string,
    fields: Partial<Pick<Cycle, 'name' | 'description' | 'status' | 'startDate' | 'endDate'>>
  ): Promise<void>;

  /** Soft-delete a cycle by setting deletedAt timestamp. */
  softDelete(id: string): Promise<void>;

  /** Add a work item to a cycle (many-to-many junction). */
  addWorkItem(cycleId: string, workItemId: string): Promise<void>;

  /** Remove a work item from a cycle. */
  removeWorkItem(cycleId: string, workItemId: string): Promise<void>;

  /** Get all work item IDs associated with a cycle. */
  getWorkItemIds(cycleId: string): Promise<string[]>;

  /** Get the cycle ID that a work item belongs to within a project, if any. */
  findCycleForWorkItem(projectId: string, workItemId: string): Promise<string | null>;
}
