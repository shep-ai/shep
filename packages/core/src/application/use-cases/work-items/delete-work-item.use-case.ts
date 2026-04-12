import { injectable, inject } from 'tsyringe';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';

export type DeleteWorkItemResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteWorkItemUseCase {
  constructor(@inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository) {}

  async execute(workItemId: string): Promise<DeleteWorkItemResult> {
    const existing = await this.workItemRepo.findById(workItemId);
    if (!existing) {
      return { ok: false, error: `Work item not found: "${workItemId}"` };
    }

    await this.workItemRepo.softDelete(workItemId);
    return { ok: true };
  }
}
