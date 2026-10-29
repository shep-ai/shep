/**
 * ListHarnessHistoryUseCase (spec 150) — everything a surface shows about a
 * repository's learned harness: every version newest first with its outcome
 * metrics and its trend against its parent (a regression is flagged once both
 * have the minimum sample), the edit records, the lessons, and which version
 * is current.
 */

import { inject, injectable } from 'tsyringe';
import {
  HarnessVersionTrend,
  type HarnessEditRecord,
  type HarnessLesson,
  type LearnedHarnessVersion,
} from '../../../domain/generated/output.js';
import { resolveLearningConfig } from '../../../domain/harness-learning/learning-config.js';
import {
  compareToParent,
  summarizeOutcomes,
  type VersionMetricsSummary,
} from '../../../domain/harness-learning/version-metrics.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { IHarnessRefinementRepository } from '../../ports/output/repositories/harness-refinement-repository.interface.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';
import { harnessScopeFor } from './harness-scope.js';

export interface HarnessVersionEntry {
  version: LearnedHarnessVersion;
  metrics: VersionMetricsSummary;
  trend: HarnessVersionTrend;
  /** (child − parent) / parent friction; positive is worse. */
  relativeChange: number;
  edits: HarnessEditRecord[];
}

export interface HarnessHistory {
  repositoryPath: string;
  currentVersionId?: string;
  versions: HarnessVersionEntry[];
  lessons: HarnessLesson[];
}

@injectable()
export class ListHarnessHistoryUseCase {
  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject('IHarnessRefinementRepository') private readonly runs: IHarnessRefinementRepository,
    @inject(ResolveSpaceContextUseCase) private readonly spaceContext: ResolveSpaceContextUseCase
  ) {}

  async execute(input: { repositoryPath: string; limit?: number }): Promise<HarnessHistory> {
    const repositoryPath = normalizeRepositoryPath(input.repositoryPath);
    const config = resolveLearningConfig((await this.settings.load())?.learning);
    const scope = await harnessScopeFor(this.spaceContext, repositoryPath);
    const [versions, current, lessons] = await Promise.all([
      this.harnesses.listVersions(repositoryPath, input.limit),
      this.harnesses.findAdopted(scope),
      this.harnesses.listLessons(scope),
    ]);
    const outcomes = new Map(
      await Promise.all(
        versions.map(async (v) => [v.id, await this.runs.listOutcomes(v.id)] as const)
      )
    );
    const entries = await Promise.all(
      versions.map(async (version): Promise<HarnessVersionEntry> => {
        const mine = outcomes.get(version.id) ?? [];
        const parentOutcomes = version.parentVersionId
          ? (outcomes.get(version.parentVersionId) ??
            (await this.runs.listOutcomes(version.parentVersionId)))
          : [];
        const comparison = version.parentVersionId
          ? compareToParent(mine, parentOutcomes, config.regressionMinSample)
          : undefined;
        return {
          version,
          metrics: summarizeOutcomes(mine),
          trend:
            comparison?.trend ??
            (version.parentVersionId
              ? HarnessVersionTrend.InsufficientData
              : HarnessVersionTrend.NoBaseline),
          relativeChange: comparison?.relativeChange ?? 0,
          edits: await this.harnesses.listEditRecords(version.id),
        };
      })
    );
    return {
      repositoryPath,
      ...(current ? { currentVersionId: current.id } : {}),
      versions: entries,
      lessons,
    };
  }
}
