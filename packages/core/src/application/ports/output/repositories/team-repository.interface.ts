/**
 * Team Repository Interface (Output Port)
 *
 * Feature 098, phase 2. Persistence contract for the Team entity.
 * Teams group Owners and roll up into BusinessUnits for posture
 * dashboards.
 */

import type { Team } from '../../../../domain/generated/output.js';

export interface ITeamRepository {
  /** Insert a new team. */
  create(team: Team): Promise<void>;

  /** Find a team by id (excludes soft-deleted). */
  findById(id: string): Promise<Team | null>;

  /** Find a team by slug, case-insensitive (excludes soft-deleted). */
  findBySlug(slug: string): Promise<Team | null>;

  /** List every non-deleted team, ordered by name ASC. */
  listAll(): Promise<Team[]>;

  /** List every non-deleted team belonging to the given business unit. */
  listByBusinessUnit(businessUnitId: string): Promise<Team[]>;

  /** Update mutable team fields by id. */
  update(
    id: string,
    fields: Partial<Pick<Team, 'name' | 'slug' | 'businessUnitId'>>
  ): Promise<void>;

  /** Soft-delete the team. */
  softDelete(id: string): Promise<void>;
}
