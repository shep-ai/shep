/**
 * @module Shep.Domain.Entities.PmUser
 *
 * Defines the PmUser entity — a user account for the project management system.
 * Named PmUser to avoid collision with potential OS-level User concepts.
 *
 * ## Invariants
 * - Email must be unique across all non-deleted users
 * - passwordHash is never exposed outside the infrastructure layer
 * - A default "system" user is created on first boot for backward compatibility
 * - displayName is required and used in all UI contexts
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("A user account in the project management system")
model PmUser extends SoftDeletableEntity {
  @doc("User's email address — unique identifier for login")
  email: string;

  @doc("Bcrypt-hashed password — never exposed to presentation layer")
  passwordHash: string;

  @doc("Display name shown in UI (avatars, assignments, comments)")
  displayName: string;

  @doc("Whether this is the default system user created for single-user backward compatibility")
  isSystemUser: boolean;
}
