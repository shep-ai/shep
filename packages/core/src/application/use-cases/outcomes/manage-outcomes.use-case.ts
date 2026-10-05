/**
 * ManageOutcomesUseCase (spec 130): a space's shipped opportunities with
 * their outcomes, the customers still to tell and the space's calibration;
 * shipping by hand, telling customers and recording real review hours.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunityStatus,
  type Opportunity,
  type OpportunityOutcome,
  type Space,
} from '../../../domain/generated/output.js';
import {
  calibrate,
  customersToTell,
  type CustomerToTell,
  type OutcomeCalibration,
} from '../../../domain/shared/outcomes.js';
import type {
  IOpportunityRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import type { IOutcomeRepository } from '../../ports/output/repositories/outcome-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';
import { shipOpportunity, type Shipped } from './ship-opportunity.js';

const SHIPPABLE: readonly OpportunityStatus[] = [
  OpportunityStatus.Proposed,
  OpportunityStatus.Accepted,
  OpportunityStatus.Building,
];

export interface OutcomeView {
  outcome: OpportunityOutcome;
  opportunity: Opportunity;
  customers: CustomerToTell[];
}

@injectable()
export class ManageOutcomesUseCase {
  constructor(
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('IOutcomeRepository') private readonly outcomes: IOutcomeRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  /** Space id or slug; the default space when omitted. */
  async list(
    space?: string
  ): Promise<
    OpportunityResult<{ space: Space; outcomes: OutcomeView[]; calibration: OutcomeCalibration }>
  > {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const views: OutcomeView[] = [];
    for (const outcome of await this.outcomes.list({ spaceId: scope.space.id })) {
      const opportunity = await this.opportunities.findById(outcome.opportunityId);
      if (opportunity) views.push(await this.view(outcome, opportunity));
    }
    const calibration = calibrate(
      views.map((view) => ({ estimatedHours: view.opportunity.reviewHours, outcome: view.outcome }))
    );
    return { ok: true, space: scope.space, outcomes: views, calibration };
  }

  async show(opportunityId: string): Promise<OpportunityResult<{ view: OutcomeView }>> {
    const found = await this.shippedOutcome(opportunityId);
    if (!found.ok) return found;
    return { ok: true, view: await this.view(found.outcome, found.opportunity) };
  }

  async ship(opportunityId: string, at = new Date()): Promise<OpportunityResult<Shipped>> {
    const opportunity = await this.opportunities.findById(opportunityId.trim());
    if (!opportunity) return failure(`No opportunity "${opportunityId}".`);
    if (!SHIPPABLE.includes(opportunity.status)) {
      return failure(`${opportunity.title} is ${opportunity.status}; it cannot ship.`);
    }
    return {
      ok: true,
      ...(await shipOpportunity(this.opportunities, this.outcomes, opportunity, at)),
    };
  }

  /** Marks the untold customers of a shipped opportunity told; returns who they were. */
  async tell(
    opportunityId: string,
    at = new Date()
  ): Promise<OpportunityResult<{ customers: CustomerToTell[] }>> {
    const found = await this.shippedOutcome(opportunityId);
    if (!found.ok) return found;
    const linked = await this.signals.list({ opportunityId: found.opportunity.id });
    const customers = customersToTell(linked);
    const toTell = new Set(customers.flatMap((customer) => customer.signalIds));
    for (const signal of linked) {
      if (toTell.has(signal.id))
        await this.signals.update({ ...signal, toldAt: at, updatedAt: at });
    }
    return { ok: true, customers };
  }

  async recordHours(
    opportunityId: string,
    hours: number
  ): Promise<OpportunityResult<{ outcome: OpportunityOutcome }>> {
    if (!Number.isFinite(hours) || hours <= 0) return failure('Review hours must be more than 0.');
    const found = await this.shippedOutcome(opportunityId);
    if (!found.ok) return found;
    const outcome: OpportunityOutcome = {
      ...found.outcome,
      actualReviewHours: hours,
      updatedAt: new Date(),
    };
    await this.outcomes.update(outcome);
    return { ok: true, outcome };
  }

  private async shippedOutcome(
    opportunityId: string
  ): Promise<OpportunityResult<{ opportunity: Opportunity; outcome: OpportunityOutcome }>> {
    const opportunity = await this.opportunities.findById(opportunityId.trim());
    if (!opportunity) return failure(`No opportunity "${opportunityId}".`);
    const outcome = await this.outcomes.findByOpportunity(opportunity.id);
    if (!outcome) return failure(`${opportunity.title} has not shipped.`);
    return { ok: true, opportunity, outcome };
  }

  private async view(outcome: OpportunityOutcome, opportunity: Opportunity): Promise<OutcomeView> {
    const linked = await this.signals.list({ opportunityId: opportunity.id });
    return { outcome, opportunity, customers: customersToTell(linked) };
  }
}
