/** A work item's investigations, newest first (spec 123). */

import { injectable, inject } from 'tsyringe';
import type { WorkItem, WorkItemInvestigation } from '../../../domain/generated/output.js';
import type { IInvestigationRepository } from '../../ports/output/repositories/investigation-repository.interface.js';
import { GetWorkItemUseCase } from '../work-items/get-work-item.use-case.js';
import { listInvestigations } from './investigation-records.js';

export type GetWorkItemInvestigationsResult =
  | { ok: true; workItem: WorkItem; investigations: WorkItemInvestigation[] }
  | { ok: false; error: string };

@injectable()
export class GetWorkItemInvestigationsUseCase {
  constructor(
    @inject('IInvestigationRepository') private readonly repo: IInvestigationRepository,
    @inject(GetWorkItemUseCase) private readonly getWorkItem: GetWorkItemUseCase
  ) {}

  /** `workItem` is an id or a key such as PAY-42. */
  async execute(workItem: string): Promise<GetWorkItemInvestigationsResult> {
    const found = await this.getWorkItem.execute(workItem);
    if (!found.ok) return found;
    return {
      ok: true,
      workItem: found.workItem,
      investigations: await listInvestigations(this.repo, found.workItem.id),
    };
  }
}
