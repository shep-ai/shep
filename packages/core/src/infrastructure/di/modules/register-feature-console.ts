/**
 * Terminal feature console (spec 142): the snapshot, action and log-tail use
 * cases, by class (the `shep tui` command) and by string token (any web
 * surface that wants the same view).
 *
 * Kept in its own module so `register-use-cases.ts` does not grow further.
 */

import type { DependencyContainer } from 'tsyringe';

import { GetFeatureConsoleSnapshotUseCase } from '../../../application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import { RunFeatureConsoleActionUseCase } from '../../../application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { GetFeatureLogTailUseCase } from '../../../application/use-cases/feature-console/get-feature-log-tail.use-case.js';

export function registerFeatureConsole(container: DependencyContainer): void {
  container.registerSingleton(GetFeatureConsoleSnapshotUseCase);
  container.registerSingleton(RunFeatureConsoleActionUseCase);
  container.registerSingleton(GetFeatureLogTailUseCase);

  container.register('GetFeatureConsoleSnapshotUseCase', {
    useFactory: (c) => c.resolve(GetFeatureConsoleSnapshotUseCase),
  });
  container.register('RunFeatureConsoleActionUseCase', {
    useFactory: (c) => c.resolve(RunFeatureConsoleActionUseCase),
  });
  container.register('GetFeatureLogTailUseCase', {
    useFactory: (c) => c.resolve(GetFeatureLogTailUseCase),
  });
}
