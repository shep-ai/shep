/**
 * @module Shep.Domain.Entities.PmProjectMember
 *
 * Defines the PmProjectMember entity — a junction entity linking users to projects
 * with a specific role. Supports the RBAC model for project-level permissions.
 *
 * ## Invariants
 * - A user can have at most one role per project
 * - Every project must have at least one Admin member
 * - The (projectId, userId) pair is unique among non-deleted records
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("Links a user to a project with a specific role for access control")
model PmProjectMember extends SoftDeletableEntity {
  @doc("ID of the project this membership belongs to")
  projectId: UUID;

  @doc("ID of the user who is a member")
  userId: UUID;

  @doc("Role determining the user's permissions within the project")
  role: ProjectRole;
}
