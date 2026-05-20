/**
 * shep supervisor disable
 *
 * Flips the `enabled` flag off on the SupervisorPolicy for the
 * (scopeType, scopeId?, featureId?) scope. Idempotent.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DisableSupervisorUseCase } from '@/application/use-cases/agents/disable-supervisor.use-case.js';
import { messages } from '../../ui/index.js';

interface DisableOptions {
  scope: string;
  scopeId?: string;
  feature?: string;
}

export function createDisableCommand(): Command {
  return new Command('disable')
    .description('Disable an existing supervisor policy')
    .requiredOption('--scope <type>', 'Scope type: global, repo, or app')
    .option('--scope-id <id>', 'Scope identifier (app or repo UUID; omit for global)')
    .option('--feature <id>', 'Feature id for a per-feature override')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor disable --scope global
  $ shep supervisor disable --scope app --scope-id <app-id>
  $ shep supervisor disable --scope repo --scope-id <repo-id> --feature <feature-id>`
    )
    .action(async (options: DisableOptions) => {
      try {
        const useCase = container.resolve(DisableSupervisorUseCase);
        const policy = await useCase.execute({
          scopeType: options.scope,
          scopeId: options.scopeId,
          featureId: options.feature,
        });
        messages.newline();
        messages.warning(
          `Supervisor disabled for ${policy.scopeType}${policy.scopeId ? `:${policy.scopeId}` : ''}${policy.featureId ? `/${policy.featureId}` : ''}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to disable supervisor', err);
        process.exitCode = 1;
      }
    });
}
