import { injectable, inject } from 'tsyringe';
import type { IPageRepository } from '../../ports/output/repositories/page-repository.interface.js';

export type DeletePageResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeletePageUseCase {
  constructor(@inject('IPageRepository') private readonly pageRepo: IPageRepository) {}

  async execute(pageId: string): Promise<DeletePageResult> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      return { ok: false, error: `Page not found: "${pageId}"` };
    }
    await this.pageRepo.softDelete(pageId);
    return { ok: true };
  }
}
