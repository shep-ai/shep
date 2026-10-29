/** View shapes of the Learning page (spec 150). */

export type {
  HarnessHistory,
  HarnessVersionEntry,
} from '@shepai/core/application/use-cases/harness-learning/list-harness-history.use-case';
export type { HarnessVersionDetail } from '@shepai/core/application/use-cases/harness-learning/get-harness-version.use-case';

export interface LearningRepositoryOption {
  path: string;
  name: string;
}

/** Short id shown and accepted everywhere (`shep learn show <id>` takes it too). */
export const SHORT_ID_LENGTH = 8;
export const shortId = (id: string): string => id.slice(0, SHORT_ID_LENGTH);

export const LEARNING_PATH = '/learning';

export function learningHref(repositoryPath: string, versionId?: string): string {
  const params = new URLSearchParams({ repo: repositoryPath });
  if (versionId) params.set('version', versionId);
  return `${LEARNING_PATH}?${params.toString()}`;
}
