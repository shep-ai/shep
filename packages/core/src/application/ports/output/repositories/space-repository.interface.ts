/**
 * Space Repository Interface (Output Port) — spec 120.
 *
 * Persistence for spaces, the hard knowledge boundaries (for example "Acme"
 * and "Personal"). Exactly one space is the default at any time.
 */

import type { Space } from '../../../../domain/generated/output.js';

export interface ISpaceRepository {
  /** Every space, the default first, then by name. */
  list(): Promise<Space[]>;

  findById(id: string): Promise<Space | null>;

  findBySlug(slug: string): Promise<Space | null>;

  /** The default space. Migration 152 guarantees one exists. */
  getDefault(): Promise<Space>;

  /** Insert a new space. Its `isDefault` value is stored as given. */
  create(space: Space): Promise<void>;

  /** Update name, slug, description, colour and updatedAt. Never changes the default flag. */
  update(space: Space): Promise<void>;

  /** Make one space the default and clear the flag on every other, in one transaction. */
  setDefault(id: string): Promise<void>;

  delete(id: string): Promise<void>;
}
