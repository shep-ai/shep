/**
 * `shep bedrock init --app <id>`
 *
 * Persists `bedrockEnabled = true` on the application and runs
 * `bedrock init` inside its worktree, streaming subprocess output to stdout.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { EnableBedrockForApplicationUseCaseToken } from '@/infrastructure/di/tokens.js';
import type { EnableBedrockForApplicationUseCase } from '@/application/use-cases/applications/enable-bedrock-for-application.use-case.js';
import { messages } from '../../ui/index.js';
import { appOption, pipeProgressToStdout, renderBedrockError } from './shared.js';

export function createBedrockInitCommand(): Command {
  const cmd = new Command('init').description(
    'Enable bedrock memory for an application and run `bedrock init`'
  );
  appOption(cmd).action(async (options: { app: string }) => {
    try {
      const useCase = container.resolve<EnableBedrockForApplicationUseCase>(
        EnableBedrockForApplicationUseCaseToken
      );
      const result = await useCase.execute({
        applicationId: options.app,
        onProgress: pipeProgressToStdout,
      });

      if (result.exitCode !== 0) {
        messages.error(`bedrock init failed (exit code ${result.exitCode})`);
        process.exitCode = 1;
        return;
      }
      messages.success(`Bedrock initialized for application ${options.app}`);
    } catch (error) {
      renderBedrockError('Failed to initialize bedrock', error);
    }
  });
  return cmd;
}
