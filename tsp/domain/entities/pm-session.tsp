/**
 * @module Shep.Domain.Entities.PmSession
 *
 * Defines the PmSession entity — an authenticated user session.
 * Sessions are created on login and invalidated on logout or expiry.
 *
 * ## Invariants
 * - token is a cryptographically random string (UUID v4)
 * - expiresAt must be in the future at creation time
 * - A session becomes invalid when expiresAt is past or deletedAt is set
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

@doc("An authenticated user session with a secure token and expiry")
model PmSession extends SoftDeletableEntity {
  @doc("ID of the user who owns this session")
  userId: UUID;

  @doc("Secure session token used for authentication")
  token: string;

  @doc("When this session expires — after this time, the session is invalid")
  expiresAt: utcDateTime;
}
