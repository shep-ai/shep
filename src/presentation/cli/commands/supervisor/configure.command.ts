/**
 * shep supervisor configure
 *
 * Creates or replaces a SupervisorPolicy for the (scopeType, scopeId?,
 * featureId?) scope (spec 093, FR-13). Wraps ConfigureSupervisorUseCase.
 */

import { Command, Option } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ConfigureSupervisorUseCase } from '@/application/use-cases/agents/configure-supervisor.use-case.js';
import { SupervisorAutonomy, type SupervisorScopeType } from '@/domain/generated/output.js';
import { colors, messages } from '../../ui/index.js';

interface ConfigureOptions {
  scope: string;
  scopeId?: string;
  feature?: string;
  autonomy: SupervisorAutonomy;
  model?: string;
  promptVersion?: string;
  prdAuthority?: SupervisorAutonomy;
  planAuthority?: SupervisorAutonomy;
  mergeAuthority?: SupervisorAutonomy;
}

const AUTONOMY_VALUES = Object.values(SupervisorAutonomy) as string[];

export function createConfigureCommand(): Command {
  return new Command('configure')
    .description('Create or update a supervisor policy')
    .requiredOption('--scope <type>', 'Scope type: global, repo, or app')
    .option('--scope-id <id>', 'Scope identifier (app or repo UUID; omit for global)')
    .option('--feature <id>', 'Feature id for a per-feature override')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor configure --scope global --autonomy advisory
  $ shep supervisor configure --scope app --scope-id <app-id> --autonomy delegated
  $ shep supervisor configure --scope repo --scope-id <repo-id> --model gpt-4o`
    )
    .addOption(
      new Option('--autonomy <level>', 'Default autonomy level')
        .choices(AUTONOMY_VALUES)
        .default(SupervisorAutonomy.advisory)
    )
    .option('--model <id>', 'Evaluator model id (optional)')
    .option('--prompt-version <version>', 'Evaluator prompt version (optional)')
    .addOption(
      new Option('--prd-authority <level>', 'Per-gate override for prd').choices(AUTONOMY_VALUES)
    )
    .addOption(
      new Option('--plan-authority <level>', 'Per-gate override for plan').choices(AUTONOMY_VALUES)
    )
    .addOption(
      new Option('--merge-authority <level>', 'Per-gate override for merge').choices(
        AUTONOMY_VALUES
      )
    )
    .action(async (options: ConfigureOptions) => {
      try {
        const useCase = container.resolve(ConfigureSupervisorUseCase);
        const gateAuthority: Partial<Record<'prd' | 'plan' | 'merge', SupervisorAutonomy>> = {};
        if (options.prdAuthority) gateAuthority.prd = options.prdAuthority;
        if (options.planAuthority) gateAuthority.plan = options.planAuthority;
        if (options.mergeAuthority) gateAuthority.merge = options.mergeAuthority;

        const policy = await useCase.execute({
          scopeType: options.scope as SupervisorScopeType,
          scopeId: options.scopeId,
          featureId: options.feature,
          autonomyLevel: options.autonomy,
          modelId: options.model,
          promptVersion: options.promptVersion,
          gateAuthority: Object.keys(gateAuthority).length > 0 ? gateAuthority : undefined,
        });

        messages.newline();
        messages.success(
          `Supervisor policy saved (${policy.scopeType}${policy.scopeId ? `:${policy.scopeId}` : ''}${policy.featureId ? `/${policy.featureId}` : ''})`
        );
        console.log(`  ${colors.muted('autonomy')}    ${colors.info(policy.autonomyLevel)}`);
        if (policy.modelId) console.log(`  ${colors.muted('model')}       ${policy.modelId}`);
        if (policy.promptVersion)
          console.log(`  ${colors.muted('prompt')}      ${policy.promptVersion}`);
        if (policy.gateAuthorityJson)
          console.log(`  ${colors.muted('gate-rules')}  ${policy.gateAuthorityJson}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to configure supervisor', err);
        process.exitCode = 1;
      }
    });
}
