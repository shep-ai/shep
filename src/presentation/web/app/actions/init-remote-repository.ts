'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import { invalidateRepoGitCache } from '@/app/(dashboard)/get-graph-data';
import type { IRepositoryRepository } from '@shepai/core/application/ports/output/repositories/repository-repository.interface';
import type { InitRemoteRepositoryUseCase } from '@shepai/core/application/use-cases/repositories/init-remote-repository.use-case';
import {
  GitPrError,
  GitPrErrorCode,
} from '@shepai/core/application/ports/output/services/git-pr-service.interface';

export interface InitRemoteInput {
  repositoryId: string;
  name: string;
  isPrivate: boolean;
  org?: string;
}

export async function initRemoteRepository(
  input: InitRemoteInput
): Promise<{ repoUrl: string } | { error: string }> {
  if (!input.repositoryId?.trim()) {
    return { error: 'Repository id is required' };
  }

  try {
    const repoRepository = resolve<IRepositoryRepository>('IRepositoryRepository');
    const repository = await repoRepository.findById(input.repositoryId);

    if (!repository) {
      return { error: 'Repository not found.' };
    }

    const useCase = resolve<InitRemoteRepositoryUseCase>('InitRemoteRepositoryUseCase');
    const result = await useCase.execute({
      cwd: repository.path,
      name: input.name,
      isPublic: !input.isPrivate,
      org: input.org,
    });

    invalidateRepoGitCache(repository.path);
    revalidatePath('/', 'layout');

    return { repoUrl: result.repoUrl };
  } catch (error: unknown) {
    if (error instanceof GitPrError) {
      switch (error.code) {
        case GitPrErrorCode.GH_NOT_FOUND:
          return { error: 'gh CLI not found. Install with: brew install gh' };
        case GitPrErrorCode.AUTH_FAILURE:
          return { error: 'gh CLI not authenticated. Run: gh auth login' };
        case GitPrErrorCode.REMOTE_ALREADY_EXISTS:
          return { error: 'This repository already has a remote configured.' };
      }
    }
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}
