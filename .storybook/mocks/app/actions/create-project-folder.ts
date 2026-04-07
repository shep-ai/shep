import type { CreateProjectFolderResult } from '../../../../src/presentation/web/app/actions/create-project-folder';

const defaultResult: CreateProjectFolderResult = {
  ok: true,
  path: '/Users/storybook/.shep/projects/my-new-project',
};

/** Override in stories via `window.__mockCreateProjectFolder` */
export async function createProjectFolder(_name: string): Promise<CreateProjectFolderResult> {
  const win = globalThis as Record<string, unknown>;
  if (win.__mockCreateProjectFolder)
    return win.__mockCreateProjectFolder as CreateProjectFolderResult;
  return defaultResult;
}
