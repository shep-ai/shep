/**
 * Signal, opportunity and weights repositories (output ports) — spec 126.
 */

import type {
  Opportunity,
  OpportunityStatus,
  OpportunityWeights,
  Signal,
} from '../../../../domain/generated/output.js';

export interface SignalFilter {
  spaceId?: string;
  opportunityId?: string;
  /** Only signals not linked to an opportunity. */
  unlinked?: boolean;
}

export interface ISignalRepository {
  /** Newest first. */
  list(filter?: SignalFilter): Promise<Signal[]>;
  findById(id: string): Promise<Signal | null>;
  /** The signal a sending tool recorded under `externalId` in the space. */
  findByExternalId(spaceId: string, externalId: string): Promise<Signal | null>;
  create(signal: Signal): Promise<void>;
  update(signal: Signal): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface OpportunityFilter {
  spaceId?: string;
  statuses?: readonly OpportunityStatus[];
}

export interface IOpportunityRepository {
  /** Oldest first. */
  list(filter?: OpportunityFilter): Promise<Opportunity[]>;
  findById(id: string): Promise<Opportunity | null>;
  create(opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
}

export interface IOpportunityWeightsRepository {
  /** The space's own weights, or null when it uses the defaults. */
  find(spaceId: string): Promise<OpportunityWeights | null>;
  save(weights: OpportunityWeights): Promise<void>;
}
