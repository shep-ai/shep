import { injectable, inject } from 'tsyringe';
import type { IWorkItemRelationRepository } from '../../ports/output/repositories/work-item-relation-repository.interface.js';

export type DeleteWorkItemRelationResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteWorkItemRelationUseCase {
  constructor(
    @inject('IWorkItemRelationRepository')
    private readonly relationRepo: IWorkItemRelationRepository
  ) {}

  async execute(relationId: string): Promise<DeleteWorkItemRelationResult> {
    if (!relationId?.trim()) {
      return { ok: false, error: 'Relation ID is required.' };
    }

    await this.relationRepo.delete(relationId);
    return { ok: true };
  }
}
