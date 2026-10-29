/**
 * GetCurrentHarnessUseCase (spec 150)
 *
 * The learned-harness version that applies to work in a repository: its own
 * adopted version, else its product line's, else its space's. Null while the
 * `selfLearning` flag is off or nothing is adopted — the run then uses no
 * learned overlay and is exactly what it was before spec 150.
 */

import { inject, injectable } from 'tsyringe';
import type { LearnedHarnessVersion } from '../../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';
import { harnessScopeFor } from './harness-scope.js';

export interface GetCurrentHarnessInput {
  repositoryPath: string;
}

@injectable()
export class GetCurrentHarnessUseCase {
  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject(ResolveSpaceContextUseCase) private readonly spaceContext: ResolveSpaceContextUseCase
  ) {}

  async execute(input: GetCurrentHarnessInput): Promise<LearnedHarnessVersion | null> {
    if (!input.repositoryPath?.trim()) return null;
    const settings = await this.settings.load();
    if (settings?.featureFlags?.selfLearning !== true) return null;
    const repositoryPath = normalizeRepositoryPath(input.repositoryPath.trim());
    const scope = await harnessScopeFor(this.spaceContext, repositoryPath);
    return this.harnesses.findAdopted(scope);
  }
}
