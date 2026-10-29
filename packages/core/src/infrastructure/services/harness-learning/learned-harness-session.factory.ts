/**
 * Builds the learned-harness session of one feature run (spec 150) from the
 * container, so the worker only has to wrap its executor.
 */

import type { DependencyContainer } from 'tsyringe';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import type { IHarnessInstaller } from '../../../application/ports/output/services/harness-installer.interface.js';
import { GetCurrentHarnessUseCase } from '../../../application/use-cases/harness-learning/get-current-harness.use-case.js';
import { LearnedHarnessRunSession, type HarnessLog } from './learned-harness-run-session.js';

export function createLearnedHarnessSession(
  container: DependencyContainer,
  repositoryPath: string,
  log: HarnessLog
): LearnedHarnessRunSession {
  return new LearnedHarnessRunSession(
    container.resolve(GetCurrentHarnessUseCase),
    container.resolve<IHarnessInstaller>('IHarnessInstaller'),
    repositoryPath,
    log
  );
}

/**
 * The learned-harness text for an interactive session (spec 150): installs the
 * adopted version for the configured agent into the session's worktree and
 * returns the text to add to its context. Undefined when nothing is adopted,
 * the flag is off, or anything fails — a session boot never waits on learning.
 */
export function createInteractiveHarnessText(
  container: DependencyContainer
): (repositoryPath: string, worktreePath: string) => Promise<string | undefined> {
  return async (repositoryPath, worktreePath) => {
    try {
      const version = await container.resolve(GetCurrentHarnessUseCase).execute({ repositoryPath });
      if (!version || version.components.length === 0) return undefined;
      const settings = await container.resolve<ISettingsRepository>('ISettingsRepository').load();
      const agentType = settings?.agent?.type;
      if (!agentType) return undefined;
      const installation = await container
        .resolve<IHarnessInstaller>('IHarnessInstaller')
        .install({ version, agentType, worktreePath });
      return installation.systemPrompt ?? installation.promptSection;
    } catch {
      return undefined;
    }
  };
}
