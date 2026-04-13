import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Page, PageVersion } from '../../../domain/generated/output.js';
import type { IPageRepository } from '../../ports/output/repositories/page-repository.interface.js';
import type { IPageVersionRepository } from '../../ports/output/repositories/page-version-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface CreatePageInput {
  projectId: string;
  title: string;
  content?: string;
  parentId?: string;
}

export type CreatePageResult = { ok: true; page: Page } | { ok: false; error: string };

@injectable()
export class CreatePageUseCase {
  constructor(
    @inject('IPageRepository') private readonly pageRepo: IPageRepository,
    @inject('IPageVersionRepository') private readonly pageVersionRepo: IPageVersionRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(input: CreatePageInput): Promise<CreatePageResult> {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      return { ok: false, error: 'Page title is required.' };
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    if (input.parentId) {
      const parentPage = await this.pageRepo.findById(input.parentId);
      if (!parentPage) {
        return { ok: false, error: `Parent page not found: "${input.parentId}"` };
      }
    }

    const existingPages = await this.pageRepo.listByProject(input.projectId);
    const maxSortOrder = existingPages.reduce((max, p) => Math.max(max, p.sortOrder), 0);

    const now = new Date();
    const pageId = randomUUID();

    const page: Page = {
      id: pageId,
      projectId: input.projectId,
      title: trimmedTitle,
      content: input.content,
      parentId: input.parentId,
      sortOrder: maxSortOrder + 1,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.pageRepo.create(page);

    const version: PageVersion = {
      id: randomUUID(),
      pageId,
      versionNumber: 1,
      title: trimmedTitle,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };

    await this.pageVersionRepo.create(version);

    return { ok: true, page };
  }
}
