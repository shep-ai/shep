/**
 * Feature Promote Command
 *
 * Promotes an exploration feature to Regular or Fast mode via
 * in-place mode transition using PromoteExplorationUseCase.
 *
 * Usage:
 *   shep feat promote <id>          # Promote to Regular mode
 *   shep feat promote <id> --fast   # Promote to Fast mode
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { PromoteExplorationUseCase } from '@/application/use-cases/features/promote/promote-exploration.use-case.js';
import { FeatureMode } from '@/domain/generated/output.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface PromoteOptions {
  fast?: boolean;
}

export function createPromoteCommand(): Command {
  const t = getCliI18n().t;
  return new Command('promote')
    .description(t('cli:commands.feat.promote.description'))
    .argument('<id>', t('cli:commands.feat.promote.idArgument'))
    .option('--fast', t('cli:commands.feat.promote.fastOption'))
    .action(async (featureId: string, options: PromoteOptions) => {
      try {
        const targetMode = options.fast ? FeatureMode.Fast : FeatureMode.Regular;

        const useCase = container.resolve(PromoteExplorationUseCase);
        const { feature } = await spinner(t('cli:commands.feat.promote.description'), () =>
          useCase.execute({ featureId, targetMode })
        );

        messages.newline();
        messages.success(t('cli:commands.feat.promote.promoted', { name: feature.name }));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.promote.modeLabel'))}   ${feature.mode}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.promote.statusLabel'))} ${feature.lifecycle}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.promote.agentLabel'))}  ${t('cli:commands.feat.promote.agentSpawned', { mode: targetMode })}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.promote.failedToPromote'), err);
        process.exitCode = 1;
      }
    });
}
