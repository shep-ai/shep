/**
 * Space Membership Repository Interface (Output Port) — spec 120.
 *
 * Persistence for how repositories map to spaces: pattern rules and explicit
 * per-repository assignments (keyed by normalised repository path).
 */

import type { RepositorySpaceAssignment, SpaceRule } from '../../../../domain/generated/output.js';

export interface ISpaceMembershipRepository {
  /** Rules, optionally for one space, ordered by priority then creation. */
  listRules(spaceId?: string): Promise<SpaceRule[]>;

  findRuleById(id: string): Promise<SpaceRule | null>;

  createRule(rule: SpaceRule): Promise<void>;

  deleteRule(id: string): Promise<void>;

  deleteRulesForSpace(spaceId: string): Promise<void>;

  /** The explicit assignment for a normalised repository path, if any. */
  findAssignment(repositoryPath: string): Promise<RepositorySpaceAssignment | null>;

  /** Assignments, optionally for one space, ordered by path. */
  listAssignments(spaceId?: string): Promise<RepositorySpaceAssignment[]>;

  /** Insert or replace the assignment for a path, keeping its original createdAt. */
  upsertAssignment(assignment: RepositorySpaceAssignment): Promise<void>;

  deleteAssignment(repositoryPath: string): Promise<void>;

  deleteAssignmentsForSpace(spaceId: string): Promise<void>;

  /** Detach a deleted product line from every rule and assignment that used it. */
  clearProductLine(productLineId: string): Promise<void>;
}
