/**
 * @module Shep.Domain.Entities.Opportunity
 *
 * Signals and opportunities (spec 126): evidence of what users need, grouped
 * into bets scored by value per review hour, so a space's weekly review
 * capacity goes to the best of them.
 */
import "../../common/base.tsp";

/** Where a signal came from. */
@doc("Where a signal came from")
enum SignalKind {
  @doc("A customer or user asked for something or reported a problem")
  Feedback,

  @doc("Something broke in production")
  Incident,

  @doc("An issue in a connected tracker")
  Tracker,

  @doc("An agent found it while scanning the product")
  Discovery,

  @doc("Entered by a person")
  Manual,
}

/** Where an opportunity stands. */
@doc("Where an opportunity stands")
enum OpportunityStatus {
  @doc("Shaped but not decided")
  Proposed,

  @doc("Accepted: competes for review capacity")
  Accepted,

  @doc("Turned into a work item that is being built")
  Building,

  @doc("Merged and released")
  Shipped,

  @doc("Decided against, with a reason")
  Dropped,
}

/** One piece of evidence of what users need. */
@doc("One piece of evidence of what users need: a request, an incident, an issue or a finding")
model Signal extends BaseEntity {
  @doc("The space the signal belongs to")
  spaceId: string;

  @doc("The product line it concerns, if known")
  productLineId?: string;

  @doc("Where the signal came from")
  kind: SignalKind;

  @doc("One-line summary")
  title: string;

  @doc("Longer text: the request, the error, the finding")
  detail?: string;

  @doc("The customer (account) behind it, if any")
  customer?: string;

  @doc("Revenue at stake per month for that customer, in the team's currency")
  monthlyRevenue?: float64;

  @doc("Whether it needs attention soon")
  urgent: boolean;

  @doc("Link to the original: ticket, message, issue, dashboard")
  url?: string;

  @doc("The opportunity this signal supports, if linked")
  opportunityId?: string;

  @doc("The sending tool's id for it; a second signal with the same id in a space is refused")
  externalId?: string;
}

/** A bet worth building, backed by signals. */
@doc("A bet worth building, backed by signals and scored by value per review hour")
model Opportunity extends BaseEntity {
  @doc("The space the opportunity belongs to")
  spaceId: string;

  @doc("The product line it concerns, if any")
  productLineId?: string;

  @doc("One-line name of the bet")
  title: string;

  @doc("The problem it solves, in the users' terms")
  problem?: string;

  @doc("Where the opportunity stands")
  status: OpportunityStatus;

  @doc("Estimated hours of human review to merge it")
  reviewHours: float64;

  @doc("Confidence that it delivers the value, from 0 to 1")
  confidence: float64;

  @doc("Whether it advances a strategic goal of the space")
  strategic: boolean;

  @doc("The work item it became when built")
  workItemId?: string;

  @doc("When it was accepted, dropped or built")
  decidedAt?: utcDateTime;

  @doc("Why it was dropped")
  dropReason?: string;
}

/** How a space values evidence and how much review it can give. */
@doc("How a space values evidence, and how many review hours it has each week")
model OpportunityWeights {
  @doc("The space these weights belong to")
  spaceId: string;

  @doc("Value of each customer behind an opportunity")
  reach: float64;

  @doc("Value of each 1,000 a month of revenue at stake")
  revenue: float64;

  @doc("Value of each urgent signal")
  urgency: float64;

  @doc("Value added once for a strategic opportunity")
  strategic: float64;

  @doc("Hours of human review available each week")
  weeklyReviewHours: float64;
}
