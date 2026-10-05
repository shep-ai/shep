/**
 * TrackOutcomesUseCase (spec 130): follows Building opportunities to their
 * work items — Completed ships one, Cancelled returns it to Accepted — and
 * judges Pending outcomes whose window has passed. Run by the daemon and by
 * `shep outcome check`.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunityStatus,
  StateGroup,
  type Opportunity,
  type OpportunityOutcome,
} from '../../../domain/generated/output.js';
import { assessOutcome } from '../../../domain/shared/outcomes.js';
import type {
  IOpportunityRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import type { IOutcomeRepository } from '../../ports/output/repositories/outcome-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import { shipOpportunity } from './ship-opportunity.js';

export interface OutcomeSweep {
  shipped: Opportunity[];
  reopened: Opportunity[];
  judged: OpportunityOutcome[];
}

@injectable()
export class TrackOutcomesUseCase {
  constructor(
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('IWorkItemRepository') private readonly workItems: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly states: IWorkItemStateRepository,
    @inject('IOutcomeRepository') private readonly outcomes: IOutcomeRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository
  ) {}

  async run(now = new Date()): Promise<OutcomeSweep> {
    const sweep: OutcomeSweep = { shipped: [], reopened: [], judged: [] };
    const building = await this.opportunities.list({ statuses: [OpportunityStatus.Building] });
    for (const opportunity of building) {
      const group = await this.workItemGroup(opportunity.workItemId);
      if (group === StateGroup.Completed) {
        const { opportunity: shipped } = await shipOpportunity(
          this.opportunities,
          this.outcomes,
          opportunity,
          now
        );
        sweep.shipped.push(shipped);
      } else if (group === StateGroup.Cancelled) {
        const { workItemId: _cancelled, ...rest } = opportunity;
        const reopened: Opportunity = {
          ...rest,
          status: OpportunityStatus.Accepted,
          updatedAt: now,
        };
        await this.opportunities.update(reopened);
        sweep.reopened.push(reopened);
      }
    }
    for (const due of await this.outcomes.listDue(now)) {
      const opportunity = await this.opportunities.findById(due.opportunityId);
      if (!opportunity) continue;
      const signals = await this.signals.list({ spaceId: due.spaceId });
      const judged: OpportunityOutcome = {
        ...due,
        ...assessOutcome(due, opportunity, signals),
        judgedAt: now,
        updatedAt: now,
      };
      await this.outcomes.update(judged);
      sweep.judged.push(judged);
    }
    return sweep;
  }

  private async workItemGroup(workItemId: string | undefined): Promise<StateGroup | undefined> {
    if (!workItemId) return undefined;
    const item = await this.workItems.findById(workItemId);
    if (!item) return undefined;
    return (await this.states.findById(item.stateId))?.stateGroup;
  }
}
