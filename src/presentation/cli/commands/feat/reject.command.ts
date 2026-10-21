/**
 * Feature Reject Command
 *
 * Rejects a feature waiting for human approval, cancelling
 * the agent run with an optional reason.
 *
 * Usage:
 *   shep feat reject [id] [--reason <text>]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { resolveWaitingFeature } from './resolve-waiting-feature.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createRejectCommand(): Command {
  const t = getCliI18n().t;
  return new Command('reject')
    .description(t('cli:commands.feat.reject.description'))
    .argument('[id]', t('cli:commands.feat.reject.idArgument'))
    .requiredOption('--reason <text>', t('cli:commands.feat.reject.reasonOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat reject --reason "Needs more detail"      Reject the waiting feature
  $ shep feat reject abc12345 --reason "Fix the plan"  Reject a specific feature by id`
    )
    .action(async (featureId: string | undefined, options: { reason: string }) => {
      try {
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        const repoPath = process.cwd();

        const { feature, run } = await resolveWaitingFeature({
          featureId,
          repoPath,
          featureRepo,
          runRepo,
        });

        const rejectUseCase = container.resolve(RejectAgentRunUseCase);
        const result = await rejectUseCase.execute(run.id, options.reason);

        if (!result.rejected) {
          throw new Error(result.reason);
        }

        messages.newline();
        messages.warning(t('cli:commands.feat.reject.rejectedWarning', { name: feature.name }));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.reject.reasonLabel'))}    ${options.reason}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.reject.iterationLabel'))} ${result.iteration}`
        );
        if (result.iterationWarning) {
          messages.warning(t('cli:commands.feat.reject.iterationWarning'));
        }
        console.log(
          `  ${colors.muted(t('cli:commands.feat.reject.agentLabel'))}     ${t('cli:commands.feat.reject.agentRerunning')}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.reject.failedToReject'), err);
        process.exitCode = 1;
      }
    });
}
