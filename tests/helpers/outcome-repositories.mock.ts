/** An in-memory outcome repository and work item lookups (spec 130). */

import { OutcomeVerdict, StateGroup, type OpportunityOutcome } from '@/domain/generated/output.js';
import type {
  IOutcomeRepository,
  OutcomeFilter,
} from '@/application/ports/output/repositories/outcome-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';

export class InMemoryOutcomes implements IOutcomeRepository {
  readonly rows = new Map<string, OpportunityOutcome>();
  async list(filter: OutcomeFilter = {}) {
    return [...this.rows.values()]
      .filter((o) => filter.spaceId === undefined || o.spaceId === filter.spaceId)
      .sort((a, b) => b.shippedAt.getTime() - a.shippedAt.getTime());
  }
  async listDue(at: Date) {
    return [...this.rows.values()].filter(
      (o) => o.verdict === OutcomeVerdict.Pending && o.reviewAt.getTime() <= at.getTime()
    );
  }
  async findByOpportunity(opportunityId: string) {
    return [...this.rows.values()].find((o) => o.opportunityId === opportunityId) ?? null;
  }
  async create(outcome: OpportunityOutcome) {
    if (await this.findByOpportunity(outcome.opportunityId)) throw new Error('UNIQUE');
    this.rows.set(outcome.id, outcome);
  }
  async update(outcome: OpportunityOutcome) {
    this.rows.set(outcome.id, outcome);
  }
}

/** Work items and their states, by id: each work item sits in a state of `group`. */
export function workItemsIn(groups: Record<string, StateGroup>) {
  const workItems = {
    findById: async (id: string) => (id in groups ? { id, stateId: `state-${groups[id]}` } : null),
  } as unknown as IWorkItemRepository;
  const states = {
    findById: async (id: string) => {
      const group = Object.values(StateGroup).find((candidate) => `state-${candidate}` === id);
      return group ? { id, stateGroup: group } : null;
    },
  } as unknown as IWorkItemStateRepository;
  return { workItems, states };
}
