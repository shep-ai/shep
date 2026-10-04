/** In-memory signal, opportunity and weights repositories for use-case tests (spec 126). */

import type { Opportunity, OpportunityWeights, Signal } from '@/domain/generated/output.js';
import type {
  IOpportunityRepository,
  IOpportunityWeightsRepository,
  ISignalRepository,
  OpportunityFilter,
  SignalFilter,
} from '@/application/ports/output/repositories/opportunity-repository.interface.js';

export class InMemorySignals implements ISignalRepository {
  readonly rows = new Map<string, Signal>();
  async list(filter: SignalFilter = {}) {
    return [...this.rows.values()]
      .filter((s) => filter.spaceId === undefined || s.spaceId === filter.spaceId)
      .filter((s) => filter.opportunityId === undefined || s.opportunityId === filter.opportunityId)
      .filter((s) => !filter.unlinked || s.opportunityId === undefined)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(signal: Signal) {
    this.rows.set(signal.id, signal);
  }
  async update(signal: Signal) {
    this.rows.set(signal.id, signal);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class InMemoryOpportunities implements IOpportunityRepository {
  readonly rows = new Map<string, Opportunity>();
  async list(filter: OpportunityFilter = {}) {
    return [...this.rows.values()]
      .filter((o) => filter.spaceId === undefined || o.spaceId === filter.spaceId)
      .filter((o) => filter.statuses === undefined || filter.statuses.includes(o.status));
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(opportunity: Opportunity) {
    this.rows.set(opportunity.id, opportunity);
  }
  async update(opportunity: Opportunity) {
    this.rows.set(opportunity.id, opportunity);
  }
}

export class InMemoryOpportunityWeights implements IOpportunityWeightsRepository {
  readonly rows = new Map<string, OpportunityWeights>();
  async find(spaceId: string) {
    return this.rows.get(spaceId) ?? null;
  }
  async save(weights: OpportunityWeights) {
    this.rows.set(weights.spaceId, weights);
  }
}
