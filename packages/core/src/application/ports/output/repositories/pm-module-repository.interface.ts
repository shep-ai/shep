/**
 * PmModule Repository Interface (Output Port)
 *
 * Defines the contract for PmModule entity persistence operations.
 * Includes junction table operations for module-work item associations.
 */

import type { PmModule } from '../../../../domain/generated/output.js';

export interface IPmModuleRepository {
  /** Create a new module record. */
  create(mod: PmModule): Promise<void>;

  /** Find a module by its unique ID (excludes soft-deleted). */
  findById(id: string): Promise<PmModule | null>;

  /** List all non-deleted modules for a project. */
  listByProject(projectId: string): Promise<PmModule[]>;

  /** Update mutable fields on an existing module. */
  update(
    id: string,
    fields: Partial<
      Pick<PmModule, 'name' | 'description' | 'status' | 'leadId' | 'startDate' | 'endDate'>
    >
  ): Promise<void>;

  /** Soft-delete a module by setting deletedAt timestamp. */
  softDelete(id: string): Promise<void>;

  /** Add a work item to a module (many-to-many junction). */
  addWorkItem(moduleId: string, workItemId: string): Promise<void>;

  /** Remove a work item from a module. */
  removeWorkItem(moduleId: string, workItemId: string): Promise<void>;

  /** Get all work item IDs associated with a module. */
  getWorkItemIds(moduleId: string): Promise<string[]>;

  /** Get all module IDs that a work item belongs to. */
  getModuleIdsForWorkItem(workItemId: string): Promise<string[]>;
}
