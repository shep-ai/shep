import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Page, PageVersion } from '../../../domain/generated/output.js';
import type { IPageRepository } from '../../ports/output/repositories/page-repository.interface.js';
import type { IPageVersionRepository } from '../../ports/output/repositories/page-version-repository.interface.js';

export interface UpdatePageInput {
  pageId: string;
  title?: string;
  content?: string;
  parentId?: string;
  sortOrder?: number;
  isFavorite?: boolean;
}

export type UpdatePageResult = { ok: true; page: Page } | { ok: false; error: string };

@injectable()
export class UpdatePageUseCase {
  constructor(
    @inject('IPageRepository') private readonly pageRepo: IPageRepository,
    @inject('IPageVersionRepository') private readonly pageVersionRepo: IPageVersionRepository
  ) {}

  async execute(input: UpdatePageInput): Promise<UpdatePageResult> {
    const existing = await this.pageRepo.findById(input.pageId);
    if (!existing) {
      return { ok: false, error: `Page not found: "${input.pageId}"` };
    }

    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed) {
        return { ok: false, error: 'Page title cannot be empty.' };
      }
      input.title = trimmed;
    }

    const contentChanged = input.content !== undefined && input.content !== existing.content;

    if (contentChanged) {
      const latestVersion = await this.pageVersionRepo.findLatest(input.pageId);
      const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

      const now = new Date();
      const version: PageVersion = {
        id: randomUUID(),
        pageId: input.pageId,
        versionNumber: nextVersionNumber,
        title: input.title ?? existing.title,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      };

      await this.pageVersionRepo.create(version);
    }

    const { pageId, ...fields } = input;
    await this.pageRepo.update(pageId, fields);

    const updated = await this.pageRepo.findById(pageId);
    return { ok: true, page: updated! };
  }
}
