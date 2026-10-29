/**
 * Self-learning harness (spec 150): repositories, services and use cases.
 *
 * Use cases are registered under their class (CLI, worker) and under their
 * name (web routes and server actions, which can only address core by token).
 */

import type Database from 'better-sqlite3';
import type { DependencyContainer } from 'tsyringe';
import type { constructor } from 'tsyringe/dist/typings/types/index.js';

import type { ILearnedHarnessRepository } from '../../../application/ports/output/repositories/learned-harness-repository.interface.js';
import type { IHarnessRefinementRepository } from '../../../application/ports/output/repositories/harness-refinement-repository.interface.js';
import { SQLiteLearnedHarnessRepository } from '../../repositories/sqlite-learned-harness.repository.js';
import { SQLiteHarnessRefinementRepository } from '../../repositories/sqlite-harness-refinement.repository.js';
import type { IHarnessInstaller } from '../../../application/ports/output/services/harness-installer.interface.js';
import { HarnessInstallerService } from '../../services/harness-learning/harness-installer.service.js';
import { GetCurrentHarnessUseCase } from '../../../application/use-cases/harness-learning/get-current-harness.use-case.js';
import type { IHarnessImprover } from '../../../application/ports/output/services/harness-improver.interface.js';
import type { IEvidenceWorkspace } from '../../../application/ports/output/services/evidence-workspace.interface.js';
import { AgentHarnessImprover } from '../../services/harness-learning/agent-harness-improver.js';
import { FileSystemEvidenceWorkspace } from '../../services/harness-learning/file-system-evidence-workspace.js';
import { BuildEvidenceBundleUseCase } from '../../../application/use-cases/harness-learning/build-evidence-bundle.use-case.js';
import { SelectHarnessLessonsUseCase } from '../../../application/use-cases/harness-learning/select-harness-lessons.use-case.js';
import { ReflectOnFeatureRunUseCase } from '../../../application/use-cases/harness-learning/reflect-on-feature-run.use-case.js';
import { RecordVersionOutcomeUseCase } from '../../../application/use-cases/harness-learning/record-version-outcome.use-case.js';
import { AdoptHarnessVersionUseCase } from '../../../application/use-cases/harness-learning/adopt-harness-version.use-case.js';
import { RejectHarnessVersionUseCase } from '../../../application/use-cases/harness-learning/reject-harness-version.use-case.js';
import { RollbackHarnessVersionUseCase } from '../../../application/use-cases/harness-learning/rollback-harness-version.use-case.js';
import { OfferHarnessCandidateUseCase } from '../../../application/use-cases/harness-learning/offer-harness-candidate.use-case.js';
import { ResolveHarnessDecisionUseCase } from '../../../application/use-cases/harness-learning/resolve-harness-decision.use-case.js';
import { ListHarnessHistoryUseCase } from '../../../application/use-cases/harness-learning/list-harness-history.use-case.js';
import { GetHarnessVersionUseCase } from '../../../application/use-cases/harness-learning/get-harness-version.use-case.js';
import { HarnessDecisionSettler } from '../../../application/use-cases/harness-learning/harness-decision-settler.js';

export function registerHarnessLearning(container: DependencyContainer): void {
  container.register<ILearnedHarnessRepository>('ILearnedHarnessRepository', {
    useFactory: (c) => new SQLiteLearnedHarnessRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IHarnessRefinementRepository>('IHarnessRefinementRepository', {
    useFactory: (c) =>
      new SQLiteHarnessRefinementRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IHarnessInstaller>('IHarnessInstaller', {
    useFactory: (c) => c.resolve(HarnessInstallerService),
  });

  container.register<IHarnessImprover>('IHarnessImprover', {
    useFactory: (c) => c.resolve(AgentHarnessImprover),
  });
  container.register<IEvidenceWorkspace>('IEvidenceWorkspace', {
    useFactory: (c) => c.resolve(FileSystemEvidenceWorkspace),
  });
  container.registerSingleton(HarnessDecisionSettler);

  const useCases = {
    GetCurrentHarnessUseCase,
    BuildEvidenceBundleUseCase,
    SelectHarnessLessonsUseCase,
    ReflectOnFeatureRunUseCase,
    RecordVersionOutcomeUseCase,
    AdoptHarnessVersionUseCase,
    RejectHarnessVersionUseCase,
    RollbackHarnessVersionUseCase,
    OfferHarnessCandidateUseCase,
    ResolveHarnessDecisionUseCase,
    ListHarnessHistoryUseCase,
    GetHarnessVersionUseCase,
  } as const;
  for (const [token, useCase] of Object.entries(useCases)) {
    registerUseCase(container, token, useCase as constructor<unknown>);
  }
}

/** Registers a use case once, under its class and under its name for string-token callers. */
function registerUseCase<T>(
  container: DependencyContainer,
  token: string,
  useCase: constructor<T>
): void {
  container.registerSingleton(useCase);
  container.register(token, { useFactory: (c) => c.resolve(useCase) });
}
