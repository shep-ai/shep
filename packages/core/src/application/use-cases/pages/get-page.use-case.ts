import { injectable, inject } from 'tsyringe';
import type { Page } from '../../../domain/generated/output.js';
import type { IPageRepository } from '../../ports/output/repositories/page-repository.interface.js';

export type GetPageResult = { ok: true; page: Page } | { ok: false; error: string };

@injectable()
export class GetPageUseCase {
  constructor(@inject('IPageRepository') private readonly pageRepo: IPageRepository) {}

  async execute(pageId: string): Promise<GetPageResult> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      return { ok: false, error: `Page not found: "${pageId}"` };
    }
    return { ok: true, page };
  }
}
