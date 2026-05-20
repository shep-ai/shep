/**
 * shep supervisor status
 *
 * Shows the effective SupervisorPolicy for the (scopeType, scopeId?,
 * featureId?) scope, falling back per the resolution rules in
 * GetSupervisorPolicyUseCase.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetSupervisorPolicyUseCase } from '@/application/use-cases/agents/get-supervisor-policy.use-case.js';
import { colors, messages, symbols } from '../../ui/index.js';

interface StatusOptions {
  scope: string;
  scopeId?: string;
  feature?: string;
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show the effective supervisor policy for a scope')
    .requiredOption('--scope <type>', 'Scope type: global, repo, or app')
    .option('--scope-id <id>', 'Scope identifier (app or repo UUID; omit for global)')
    .option('--feature <id>', 'Feature id for a per-feature override')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor status --scope global
  $ shep supervisor status --scope app --scope-id <app-id>
  $ shep supervisor status --scope repo --scope-id <repo-id> --feature <feature-id>`
    )
    .action(async (options: StatusOptions) => {
      try {
        const useCase = container.resolve(GetSupervisorPolicyUseCase);
        const policy = await useCase.execute({
          scopeType: options.scope,
          scopeId: options.scopeId,
          featureId: options.feature,
        });

        if (!policy) {
          messages.newline();
          console.log(`  ${colors.muted(symbols.dotEmpty)} No supervisor policy configured`);
          messages.newline();
          return;
        }

        messages.newline();
        console.log(
          `  ${colors.muted('scope')}      ${policy.scopeType}${policy.scopeId ? `:${policy.scopeId}` : ''}${policy.featureId ? `/${policy.featureId}` : ''}`
        );
        console.log(
          `  ${colors.muted('enabled')}    ${policy.enabled ? colors.success('yes') : colors.muted('no')}`
        );
        console.log(`  ${colors.muted('autonomy')}   ${colors.info(policy.autonomyLevel)}`);
        if (policy.modelId) {
          console.log(`  ${colors.muted('model')}      ${policy.modelId}`);
        }
        if (policy.promptVersion) {
          console.log(`  ${colors.muted('prompt')}     ${policy.promptVersion}`);
        }
        if (policy.gateAuthorityJson) {
          console.log(`  ${colors.muted('gates')}      ${policy.gateAuthorityJson}`);
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to load supervisor status', err);
        process.exitCode = 1;
      }
    });
}
