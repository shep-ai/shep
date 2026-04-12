import { injectable, inject } from 'tsyringe';
import type { WorkItem } from '../../../domain/generated/output.js';
import type {
  IWorkItemRepository,
  WorkItemFilter,
} from '../../ports/output/repositories/work-item-repository.interface.js';

@injectable()
export class ListWorkItemsUseCase {
  constructor(@inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository) {}

  async execute(projectId: string, filters?: WorkItemFilter): Promise<WorkItem[]> {
    return this.workItemRepo.listByProject(projectId, filters);
  }
}
