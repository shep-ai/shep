import { injectable, inject } from 'tsyringe';
import type {
  IWorkItemRelationRepository,
  WorkItemRelation,
} from '../../ports/output/repositories/work-item-relation-repository.interface.js';

@injectable()
export class ListWorkItemRelationsUseCase {
  constructor(
    @inject('IWorkItemRelationRepository')
    private readonly relationRepo: IWorkItemRelationRepository
  ) {}

  async execute(workItemId: string): Promise<WorkItemRelation[]> {
    return this.relationRepo.listByWorkItem(workItemId);
  }
}
