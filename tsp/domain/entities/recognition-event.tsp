/**
 * @module Shep.Domain.Entities.RecognitionEvent
 *
 * Defines the RecognitionEvent entity — a single, durable record that a
 * contributor was recognized for a specific kind of contribution.
 *
 * Idempotency: the persistence layer enforces UNIQUE(`contributorId`, `kind`,
 * `prNumber`) so reprocessing a webhook delivery never double-counts (NFR-11).
 *
 * Populated by:
 *  - `award-recognition.use-case.ts` on PR merge.
 *  - `publish-monthly-recap.use-case.ts` for `MonthlyShoutout` kinds.
 *
 * ## Field semantics
 *  - `prNumber` is set for kinds tied to a PR (FirstPR, NthPR) and used as the
 *    third part of the idempotency key. Use `0` (not absent) for kinds that
 *    are intrinsically not PR-bound (FirstIssue, MonthlyShoutout) so the
 *    UNIQUE index has a deterministic value.
 *  - `monthRecapId` correlates the event with a monthly recap artifact when
 *    `kind = MonthlyShoutout`.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../value-objects/recognition-kind.tsp";

@doc("Durable record that a contributor was recognized for a specific contribution")
model RecognitionEvent extends BaseEntity {
  @doc("Contributor this recognition event belongs to")
  contributorId: UUID;

  @doc("Kind of recognition")
  kind: RecognitionKind;

  @doc("ISO timestamp when the recognition was awarded")
  occurredAt: utcDateTime;

  @doc("PR number for PR-bound kinds (FirstPR, NthPR); 0 for non-PR kinds")
  prNumber: int32;

  @doc("Identifier of the monthly recap artifact when kind = MonthlyShoutout")
  monthRecapId?: string;
}
