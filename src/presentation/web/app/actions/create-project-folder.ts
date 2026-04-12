'use server';

import { resolve } from '@/lib/server-container';
import type { CreateProjectUseCase } from '@shepai/core/application/use-cases/projects/create-project.use-case';

export interface CreateProjectFolderResult {
  ok: boolean;
  /** Absolute path to the created folder, normalized to forward slashes. */
  path?: string;
  error?: string;
}

/**
 * Thin server-action wrapper around CreateProjectUseCase. All slug rules,
 * existence checks, filesystem mutations, and git bootstrapping live in the
 * use case + IProjectScaffoldService adapter — see:
 *
 *   packages/core/src/application/use-cases/projects/create-project.use-case.ts
 *   packages/core/src/infrastructure/services/project-scaffold/fs-project-scaffold.service.ts
 */
export async function createProjectFolder(name: string): Promise<CreateProjectFolderResult> {
  const useCase = resolve<CreateProjectUseCase>('CreateProjectUseCase');
  const result = await useCase.execute({ name });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, path: result.path };
}
