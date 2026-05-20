/**
 * shep supervisor enable
 *
 * Flips the `enabled` flag on the SupervisorPolicy for the
 * (scopeType, scopeId?, featureId?) scope without touching any other
 * field. Idempotent.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { EnableSupervisorUseCase } from '@/application/use-cases/agents/enable-supervisor.use-case.js';
import { messages } from '../../ui/index.js';

interface EnableOptions {
  scope: string;
  scopeId?: string;
  feature?: string;
}

export function createEnableCommand(): Command {
  return new Command('enable')
    .description('Enable an existing supervisor policy')
    .requiredOption('--scope <type>', 'Scope type: global, repo, or app')
    .option('--scope-id <id>', 'Scope identifier (app or repo UUID; omit for global)')
    .option('--feature <id>', 'Feature id for a per-feature override')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor enable --scope global
  $ shep supervisor enable --scope app --scope-id <app-id>
  $ shep supervisor enable --scope repo --scope-id <repo-id> --feature <feature-id>`
    )
    .action(async (options: EnableOptions) => {
      try {
        const useCase = container.resolve(EnableSupervisorUseCase);
        const policy = await useCase.execute({
          scopeType: options.scope,
          scopeId: options.scopeId,
          featureId: options.feature,
        });
        messages.newline();
        messages.success(
          `Supervisor enabled for ${policy.scopeType}${policy.scopeId ? `:${policy.scopeId}` : ''}${policy.featureId ? `/${policy.featureId}` : ''}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to enable supervisor', err);
        process.exitCode = 1;
      }
    });
}
