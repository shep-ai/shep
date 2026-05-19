/**
 * Owner Repository Interface (Output Port)
 *
 * Feature 098, phase 2 (Asset & Ownership Model). Persistence contract for
 * the Owner entity — a person or team identifier responsible for ASPM
 * assets and findings.
 *
 * Soft-deletable per NFR-12; queries exclude soft-deleted rows by default.
 */

import type { Owner } from '../../../../domain/generated/output.js';

export interface IOwnerRepository {
  /** Insert a new owner record. */
  create(owner: Owner): Promise<void>;

  /** Find an owner by id (excludes soft-deleted). */
  findById(id: string): Promise<Owner | null>;

  /** Find an owner by contact handle, case-insensitive (excludes soft-deleted). */
  findByHandle(handle: string): Promise<Owner | null>;

  /** List every non-deleted owner, ordered by name ASC. */
  listAll(): Promise<Owner[]>;

  /** List every non-deleted owner on the given team. */
  listByTeam(teamId: string): Promise<Owner[]>;

  /** Update mutable owner fields by id. */
  update(
    id: string,
    fields: Partial<Pick<Owner, 'name' | 'handle' | 'teamId' | 'notes'>>
  ): Promise<void>;

  /** Soft-delete the owner. */
  softDelete(id: string): Promise<void>;
}
