import { injectable, inject } from 'tsyringe';
import type { WorkItem } from '../../../domain/generated/output.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export type GetWorkItemResult = { ok: true; workItem: WorkItem } | { ok: false; error: string };

@injectable()
export class GetWorkItemUseCase {
  constructor(
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(identifier: string): Promise<GetWorkItemResult> {
    const byId = await this.workItemRepo.findById(identifier);
    if (byId) {
      return { ok: true, workItem: byId };
    }

    const match = identifier.match(/^([A-Z][A-Z0-9]*)-(\d+)$/i);
    if (match) {
      const prefix = match[1].toUpperCase();
      const seqId = parseInt(match[2], 10);
      const project = await this.projectRepo.findByIdentifierPrefix(prefix);
      if (project) {
        const bySeq = await this.workItemRepo.findByIdentifier(project.id, seqId);
        if (bySeq) {
          return { ok: true, workItem: bySeq };
        }
      }
    }

    return { ok: false, error: `Work item not found: "${identifier}"` };
  }
}
