/** Row ⇄ entity conversion for signals, opportunities and weights (spec 126). */

import type {
  Opportunity,
  OpportunitySource,
  OpportunityStatus,
  OpportunityWeights,
  Signal,
  SignalKind,
} from '../../../../domain/generated/output.js';
import { defined, millis, optionalMillis } from './row-values.js';

export interface SignalRow {
  id: string;
  space_id: string;
  product_line_id: string | null;
  kind: string;
  title: string;
  detail: string | null;
  customer: string | null;
  monthly_revenue: number | null;
  urgent: number;
  url: string | null;
  opportunity_id: string | null;
  external_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface OpportunityRow {
  id: string;
  space_id: string;
  product_line_id: string | null;
  title: string;
  problem: string | null;
  status: string;
  review_hours: number;
  confidence: number;
  strategic: number;
  work_item_id: string | null;
  decided_at: number | null;
  drop_reason: string | null;
  source: string | null;
  brief: string | null;
  created_at: number;
  updated_at: number;
}

export interface OpportunityWeightsRow {
  space_id: string;
  reach: number;
  revenue: number;
  urgency: number;
  strategic: number;
  weekly_review_hours: number;
  discovery_every_hours: number | null;
}

export function signalToDatabase(signal: Signal): SignalRow {
  return {
    id: signal.id,
    space_id: signal.spaceId,
    product_line_id: signal.productLineId ?? null,
    kind: signal.kind,
    title: signal.title,
    detail: signal.detail ?? null,
    customer: signal.customer ?? null,
    monthly_revenue: signal.monthlyRevenue ?? null,
    urgent: signal.urgent ? 1 : 0,
    url: signal.url ?? null,
    opportunity_id: signal.opportunityId ?? null,
    external_id: signal.externalId ?? null,
    created_at: millis(signal.createdAt),
    updated_at: millis(signal.updatedAt),
  };
}

export function signalFromDatabase(row: SignalRow): Signal {
  return {
    id: row.id,
    spaceId: row.space_id,
    kind: row.kind as SignalKind,
    title: row.title,
    urgent: row.urgent === 1,
    ...defined({
      productLineId: row.product_line_id,
      detail: row.detail,
      customer: row.customer,
      monthlyRevenue: row.monthly_revenue,
      url: row.url,
      opportunityId: row.opportunity_id,
      externalId: row.external_id,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function opportunityToDatabase(opportunity: Opportunity): OpportunityRow {
  return {
    id: opportunity.id,
    space_id: opportunity.spaceId,
    product_line_id: opportunity.productLineId ?? null,
    title: opportunity.title,
    problem: opportunity.problem ?? null,
    status: opportunity.status,
    review_hours: opportunity.reviewHours,
    confidence: opportunity.confidence,
    strategic: opportunity.strategic ? 1 : 0,
    work_item_id: opportunity.workItemId ?? null,
    decided_at: optionalMillis(opportunity.decidedAt),
    drop_reason: opportunity.dropReason ?? null,
    source: opportunity.source ?? null,
    brief: opportunity.brief ?? null,
    created_at: millis(opportunity.createdAt),
    updated_at: millis(opportunity.updatedAt),
  };
}

export function opportunityFromDatabase(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    status: row.status as OpportunityStatus,
    reviewHours: row.review_hours,
    confidence: row.confidence,
    strategic: row.strategic === 1,
    ...defined({
      productLineId: row.product_line_id,
      problem: row.problem,
      workItemId: row.work_item_id,
      decidedAt: row.decided_at === null ? null : new Date(row.decided_at),
      dropReason: row.drop_reason,
      source: row.source as OpportunitySource | null,
      brief: row.brief,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function weightsToDatabase(weights: OpportunityWeights): OpportunityWeightsRow {
  return {
    space_id: weights.spaceId,
    reach: weights.reach,
    revenue: weights.revenue,
    urgency: weights.urgency,
    strategic: weights.strategic,
    weekly_review_hours: weights.weeklyReviewHours,
    discovery_every_hours: weights.discoveryEveryHours ?? null,
  };
}

export function weightsFromDatabase(row: OpportunityWeightsRow): OpportunityWeights {
  return {
    spaceId: row.space_id,
    reach: row.reach,
    revenue: row.revenue,
    urgency: row.urgency,
    strategic: row.strategic,
    weeklyReviewHours: row.weekly_review_hours,
    ...defined({ discoveryEveryHours: row.discovery_every_hours }),
  };
}
