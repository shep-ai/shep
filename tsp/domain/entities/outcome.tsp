/**
 * @module Shep.Domain.Entities.Outcome
 *
 * Outcomes (spec 130): what happened after an opportunity shipped — whether
 * the reports behind it stopped, and how long it really took to review.
 */
import "../../common/base.tsp";

/** Whether a shipped opportunity solved what it was built for. */
@doc("Whether a shipped opportunity solved what it was built for")
enum OutcomeVerdict {
  @doc("Shipped; the window after shipping has not passed yet")
  Pending,

  @doc("Similar reports fell to half or less after shipping")
  Solved,

  @doc("Similar reports kept arriving after shipping")
  Persisting,
}

/** The outcome of one shipped opportunity. */
@doc("The outcome of one shipped opportunity")
model OpportunityOutcome extends BaseEntity {
  @doc("The opportunity that shipped")
  opportunityId: string;

  @doc("Its space")
  spaceId: string;

  @doc("When it shipped")
  shippedAt: utcDateTime;

  @doc("When the window after shipping ends and the outcome is judged")
  reviewAt: utcDateTime;

  @doc("Where the outcome stands")
  verdict: OutcomeVerdict;

  @doc("Similar signals in the window before shipping")
  signalsBefore?: int32;

  @doc("Similar signals in the window after shipping")
  signalsAfter?: int32;

  @doc("When it was judged")
  judgedAt?: utcDateTime;

  @doc("Hours of human review it really took, when someone recorded them")
  actualReviewHours?: float64;
}
