/**
 * BusinessUnit Repository Interface (Output Port)
 *
 * Feature 098, phase 2. Persistence contract for the BusinessUnit entity —
 * the coarsest ASPM rollup grouping.
 */

import type { BusinessUnit } from '../../../../domain/generated/output.js';

export interface IBusinessUnitRepository {
  /** Insert a new business unit. */
  create(bu: BusinessUnit): Promise<void>;

  /** Find a business unit by id (excludes soft-deleted). */
  findById(id: string): Promise<BusinessUnit | null>;

  /** Find a business unit by slug, case-insensitive (excludes soft-deleted). */
  findBySlug(slug: string): Promise<BusinessUnit | null>;

  /** List every non-deleted business unit, ordered by name ASC. */
  listAll(): Promise<BusinessUnit[]>;

  /** Update mutable business unit fields by id. */
  update(id: string, fields: Partial<Pick<BusinessUnit, 'name' | 'slug'>>): Promise<void>;

  /** Soft-delete the business unit. */
  softDelete(id: string): Promise<void>;
}
