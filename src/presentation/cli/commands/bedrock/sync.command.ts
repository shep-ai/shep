/**
 * `shep bedrock sync --app <id>`
 *
 * Dispatches RunBedrockLifecycleUseCase with action=Sync. Streams subprocess
 * output to stdout via the typed onProgress callback.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RunBedrockLifecycleUseCaseToken } from '@/infrastructure/di/tokens.js';
import type { RunBedrockLifecycleUseCase } from '@/application/use-cases/applications/run-bedrock-lifecycle.use-case.js';
import { BedrockLifecycleAction } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { appOption, pipeProgressToStdout, renderBedrockError } from './shared.js';

export function createBedrockSyncCommand(): Command {
  const cmd = new Command('sync').description(
    'Reconcile bedrock memory with git state inside the application worktree'
  );
  appOption(cmd).action(async (options: { app: string }) => {
    try {
      const useCase = container.resolve<RunBedrockLifecycleUseCase>(
        RunBedrockLifecycleUseCaseToken
      );
      const result = await useCase.execute({
        applicationId: options.app,
        action: BedrockLifecycleAction.Sync,
        onProgress: pipeProgressToStdout,
      });

      if (result.exitCode !== 0) {
        messages.error(`bedrock sync failed (exit code ${result.exitCode})`);
        process.exitCode = 1;
        return;
      }
      messages.success(`Bedrock memory synced for application ${options.app}`);
    } catch (error) {
      renderBedrockError('Failed to sync bedrock', error);
    }
  });
  return cmd;
}
