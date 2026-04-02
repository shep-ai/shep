/**
 * Feature Feedback Command
 *
 * Sends feedback on an exploration prototype to iterate on the design.
 * Resumes the interrupted exploration agent graph with the provided feedback.
 *
 * Usage:
 *   shep feat feedback <id> <feedback-text>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { FeatureMode, SdlcLifecycle } from '@/domain/generated/output.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createFeedbackCommand(): Command {
  const t = getCliI18n().t;
  return new Command('feedback')
    .description(t('cli:commands.feat.feedback.description'))
    .argument('<id>', t('cli:commands.feat.feedback.idArgument'))
    .argument('<feedback>', t('cli:commands.feat.feedback.feedbackArgument'))
    .action(async (featureId: string, feedback: string) => {
      try {
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');

        const feature =
          (await featureRepo.findById(featureId)) ?? (await featureRepo.findByIdPrefix(featureId));
        if (!feature) {
          throw new Error(`Feature not found: ${featureId}`);
        }

        if (
          feature.mode !== FeatureMode.Exploration ||
          feature.lifecycle !== SdlcLifecycle.Exploring
        ) {
          messages.error(
            t('cli:commands.feat.feedback.notExploration', {
              name: feature.name,
              mode: feature.mode,
              lifecycle: feature.lifecycle,
            })
          );
          process.exitCode = 1;
          return;
        }

        if (!feature.agentRunId) {
          throw new Error(`Feature "${feature.name}" has no agent run`);
        }

        const run = await runRepo.findById(feature.agentRunId);
        if (!run) {
          throw new Error(`Agent run not found: ${feature.agentRunId}`);
        }

        const rejectUseCase = container.resolve(RejectAgentRunUseCase);
        const result = await rejectUseCase.execute(run.id, feedback);

        if (!result.rejected) {
          throw new Error(result.reason);
        }

        messages.newline();
        messages.success(t('cli:commands.feat.feedback.feedbackSubmitted', { name: feature.name }));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.feedback.iterationLabel'))} ${result.iteration}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.feedback.agentLabel'))}     ${t('cli:commands.feat.feedback.agentIterating')}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.feedback.failedToSubmit'), err);
        process.exitCode = 1;
      }
    });
}
