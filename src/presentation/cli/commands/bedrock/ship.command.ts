/**
 * `shep bedrock ship --app <id>`
 *
 * Dispatches RunBedrockLifecycleUseCase with action=Ship. Reports the
 * bedrock subprocess exit code on completion (success or failure).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RunBedrockLifecycleUseCaseToken } from '@/infrastructure/di/tokens.js';
import type { RunBedrockLifecycleUseCase } from '@/application/use-cases/applications/run-bedrock-lifecycle.use-case.js';
import { BedrockLifecycleAction } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { appOption, pipeProgressToStdout, renderBedrockError } from './shared.js';

export function createBedrockShipCommand(): Command {
  const cmd = new Command('ship').description(
    'Commit bedrock memory updates inside the application worktree'
  );
  appOption(cmd).action(async (options: { app: string }) => {
    try {
      const useCase = container.resolve<RunBedrockLifecycleUseCase>(
        RunBedrockLifecycleUseCaseToken
      );
      const result = await useCase.execute({
        applicationId: options.app,
        action: BedrockLifecycleAction.Ship,
        onProgress: pipeProgressToStdout,
      });

      if (result.exitCode === 0) {
        messages.success(`Bedrock memory shipped (exit code 0) for application ${options.app}`);
        return;
      }
      messages.error(`bedrock ship failed (exit code ${result.exitCode})`);
      process.exitCode = 1;
    } catch (error) {
      renderBedrockError('Failed to ship bedrock memory', error);
    }
  });
  return cmd;
}
