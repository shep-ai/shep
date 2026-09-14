/**
 * Feature Resume Command
 *
 * Resumes an interrupted or failed feature agent run.
 *
 * Usage:
 *   shep feat resume <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ResumeFeatureUseCase } from '@/application/use-cases/features/resume-feature.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createResumeCommand(): Command {
  const t = getCliI18n().t;
  return new Command('resume')
    .description(t('cli:commands.feat.resume.description'))
    .argument('<id>', t('cli:commands.feat.resume.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat resume abc12345`
    )
    .action(async (id: string) => {
      try {
        const useCase = container.resolve(ResumeFeatureUseCase);
        const { feature, newRun } = await useCase.execute(id);

        messages.newline();
        messages.success(t('cli:commands.feat.resume.agentResumed'));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.resume.featureLabel'))} ${feature.name}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.resume.runIdLabel'))}  ${colors.accent(newRun.id.substring(0, 8))}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.resume.failedToResume'), err);
        process.exitCode = 1;
      }
    });
}
