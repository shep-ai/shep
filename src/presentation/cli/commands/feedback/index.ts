/**
 * Feedback Command Group (spec 127)
 *
 * Keys tools use to post feedback into a space, and the themes the posted
 * (and any other unlinked) signals form.
 *
 * Usage:
 *   shep feedback key create --name <name> [--space]
 *   shep feedback key ls [--space]
 *   shep feedback key revoke <key>
 *   shep feedback themes [--space]
 *   shep feedback promote <theme> --hours <h> [--confidence] [--title] [--space]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  GetFeedbackThemesUseCase,
  PromoteThemeUseCase,
} from '@/application/use-cases/feedback/feedback-themes.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';
import { FAILED, createKeyCommand } from './key.command.js';

function createThemesCommand(): Command {
  const t = getCliI18n().t;
  return new Command('themes')
    .description(t('cli:commands.feedback.themes.description'))
    .option('-s, --space <space>', t('cli:commands.feedback.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(GetFeedbackThemesUseCase).execute(options.space);
        report(result, ({ space, themes }) =>
          renderListView({
            title: t('cli:commands.feedback.themes.title', { space: space.name }),
            columns: [
              { label: t('cli:commands.feedback.themes.keyColumn'), width: 38 },
              { label: t('cli:commands.feedback.themes.themeColumn'), width: 32 },
              { label: t('cli:commands.feedback.themes.evidenceColumn'), width: 44 },
            ],
            rows: themes.map((theme) => [
              colors.muted(theme.key),
              theme.label,
              t('cli:commands.opportunity.evidence', {
                signals: theme.evidence.signals,
                customers: theme.evidence.customers,
                revenue: theme.evidence.revenueAtStake,
                urgent: theme.evidence.urgentSignals,
              }),
            ]),
            emptyMessage: t('cli:commands.feedback.themes.empty'),
          })
        );
      })
    );
}

interface PromoteOptions {
  hours: string;
  confidence?: string;
  title?: string;
  space?: string;
}

function createPromoteCommand(): Command {
  const t = getCliI18n().t;
  return new Command('promote')
    .description(t('cli:commands.feedback.promote.description'))
    .argument('<theme>', t('cli:commands.feedback.promote.themeArg'))
    .requiredOption('-h, --hours <hours>', t('cli:commands.opportunity.hoursOption'))
    .option('-c, --confidence <0-1>', t('cli:commands.opportunity.confidenceOption'))
    .option('-t, --title <title>', t('cli:commands.feedback.promote.titleOption'))
    .option('-s, --space <space>', t('cli:commands.feedback.spaceOption'))
    .action((theme: string, options: PromoteOptions) =>
      runCommand(FAILED, async () => {
        const hours = parseNumberOption('--hours', options.hours);
        if (!hours.ok || hours.value === undefined) return;
        const confidence = parseNumberOption('--confidence', options.confidence);
        if (!confidence.ok) return;
        const result = await container.resolve(PromoteThemeUseCase).execute({
          theme,
          reviewHours: hours.value,
          ...(confidence.value === undefined ? {} : { confidence: confidence.value }),
          ...(options.title ? { title: options.title } : {}),
          ...(options.space ? { space: options.space } : {}),
        });
        report(result, ({ opportunity, linked }) =>
          messages.success(
            t('cli:commands.feedback.promote.success', {
              title: opportunity.title,
              id: opportunity.id,
              count: linked,
            })
          )
        );
      })
    );
}

export function createFeedbackCommand(): Command {
  return new Command('feedback')
    .description(getCliI18n().t('cli:commands.feedback.description'))
    .addCommand(createKeyCommand())
    .addCommand(createThemesCommand())
    .addCommand(createPromoteCommand());
}
