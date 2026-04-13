'use server';

import { resolve } from '@/lib/server-container';
import type { CreatePageUseCase } from '@shepai/core/application/use-cases/pages/create-page.use-case';
import type { ListPagesUseCase } from '@shepai/core/application/use-cases/pages/list-pages.use-case';
import type { GetPageUseCase } from '@shepai/core/application/use-cases/pages/get-page.use-case';
import type { UpdatePageUseCase } from '@shepai/core/application/use-cases/pages/update-page.use-case';
import type { DeletePageUseCase } from '@shepai/core/application/use-cases/pages/delete-page.use-case';
import type { Page } from '@shepai/core/domain/generated/output';

export async function createPage(input: {
  projectId: string;
  title: string;
  content?: string;
  parentId?: string;
}): Promise<{ page?: Page; error?: string }> {
  if (!input.title?.trim()) {
    return { error: 'Page title is required' };
  }

  try {
    const useCase = resolve<CreatePageUseCase>('CreatePageUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { page: result.page };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create page';
    return { error: message };
  }
}

export async function listPages(projectId: string): Promise<{ pages?: Page[]; error?: string }> {
  try {
    const useCase = resolve<ListPagesUseCase>('ListPagesUseCase');
    const result = await useCase.execute(projectId);
    return { pages: result.pages };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list pages';
    return { error: message };
  }
}

export async function getPage(pageId: string): Promise<{ page?: Page; error?: string }> {
  try {
    const useCase = resolve<GetPageUseCase>('GetPageUseCase');
    const result = await useCase.execute(pageId);
    if (!result.ok) return { error: result.error };
    return { page: result.page };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get page';
    return { error: message };
  }
}

export async function updatePage(
  pageId: string,
  fields: {
    title?: string;
    content?: string;
    parentId?: string;
    sortOrder?: number;
    isFavorite?: boolean;
  }
): Promise<{ page?: Page; error?: string }> {
  try {
    const useCase = resolve<UpdatePageUseCase>('UpdatePageUseCase');
    const result = await useCase.execute({ pageId, ...fields });
    if (!result.ok) return { error: result.error };
    return { page: result.page };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update page';
    return { error: message };
  }
}

export async function deletePage(pageId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeletePageUseCase>('DeletePageUseCase');
    const result = await useCase.execute(pageId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete page';
    return { error: message };
  }
}
