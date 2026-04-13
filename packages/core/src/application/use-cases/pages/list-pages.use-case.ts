import { injectable, inject } from 'tsyringe';
import type { Page } from '../../../domain/generated/output.js';
import type { IPageRepository } from '../../ports/output/repositories/page-repository.interface.js';

export interface ListPagesResult {
  ok: true;
  pages: Page[];
}

@injectable()
export class ListPagesUseCase {
  constructor(@inject('IPageRepository') private readonly pageRepo: IPageRepository) {}

  async execute(projectId: string): Promise<ListPagesResult> {
    const pages = await this.pageRepo.listByProject(projectId);
    return { ok: true, pages };
  }
}
