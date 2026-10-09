/**
 * The scope (`appId`) a question is filed under (spec 134): the Application
 * that owns the repository, else the normalized repository path — the same
 * fallback the gate publisher uses, so the inbox finds every question.
 */

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';

export async function questionScopeForPath(
  applications: IApplicationRepository,
  path: string
): Promise<string> {
  const app = await applications.findByPath(path).catch(() => null);
  return app?.id ?? normalizeRepositoryPath(path);
}
