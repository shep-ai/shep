/**
 * @module Shep.Domain.Entities.FeedbackKey
 *
 * Feedback keys (spec 127): a key a support tool or script sends to post
 * feedback into one space. Only a hash of the key is kept.
 */
import "../../common/base.tsp";

/** A key that lets a tool post feedback into one space. */
@doc("A key that lets a tool post feedback into one space; only its hash is stored")
model FeedbackKey extends BaseEntity {
  @doc("The space feedback posted with this key lands in")
  spaceId: string;

  @doc("Which tool or script uses it")
  name: string;

  @doc("The first characters of the key, to recognise it")
  prefix: string;

  @doc("SHA-256 of the key, hex")
  keyHash: string;

  @doc("When feedback was last posted with it")
  lastUsedAt?: utcDateTime;

  @doc("When it was revoked; a revoked key is refused")
  revokedAt?: utcDateTime;
}

/** Why feedback or an alert posted with an intake key was refused. */
@doc("Why feedback or an alert posted with an intake key was refused")
enum IntakeRejection {
  @doc("The key is missing, unknown or revoked")
  Unauthorized,

  @doc("The payload is missing text or has a bad field")
  Invalid,
}
