/**
 * BuildOpportunityUseCase (spec 126)
 *
 * Turns a proposed or accepted opportunity into a work item of a project,
 * whose description carries the problem and the evidence, and moves the
 * opportunity to Building. From there the work item follows the normal
 * pipeline.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunityStatus,
  type Opportunity,
  type WorkItem,
} from '../../../domain/generated/output.js';
import { BUILDABLE_STATUSES, evidenceOf } from '../../../domain/shared/opportunity-score.js';
import { opportunityBrief } from '../../../domain/shared/opportunity-brief.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type {
  IOpportunityRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import { CreateWorkItemUseCase } from '../work-items/create-work-item.use-case.js';
import { failure, type OpportunityResult } from './opportunity-scope.js';

@injectable()
export class BuildOpportunityUseCase {
  constructor(
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository,
    @inject(CreateWorkItemUseCase) private readonly createWorkItem: CreateWorkItemUseCase
  ) {}

  /** `project` is a project id or slug. */
  async execute(
    opportunityId: string,
    project: string
  ): Promise<OpportunityResult<{ opportunity: Opportunity; workItem: WorkItem }>> {
    const opportunity = await this.opportunities.findById(opportunityId.trim());
    if (!opportunity) return failure(`No opportunity "${opportunityId}".`);
    if (!BUILDABLE_STATUSES.includes(opportunity.status)) {
      return failure(
        `${opportunity.title} is ${opportunity.status}; only proposed or accepted opportunities can be built.`
      );
    }
    const ref = project.trim();
    const target = (await this.projects.findById(ref)) ?? (await this.projects.findBySlug(ref));
    if (!target) return failure(`No project "${project}".`);

    const signals = await this.signals.list({ opportunityId: opportunity.id });
    const created = await this.createWorkItem.execute({
      projectId: target.id,
      title: opportunity.title,
      description: opportunityBrief(opportunity, signals, evidenceOf(signals)),
    });
    if (!created.ok) return created;

    const now = new Date();
    const building: Opportunity = {
      ...opportunity,
      status: OpportunityStatus.Building,
      workItemId: created.workItem.id,
      decidedAt: now,
      updatedAt: now,
    };
    await this.opportunities.update(building);
    return { ok: true, opportunity: building, workItem: created.workItem };
  }
}
