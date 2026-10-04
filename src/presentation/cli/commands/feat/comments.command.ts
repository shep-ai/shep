/**
 * shep feat comments <feature> — the review comments on a feature's pull
 * request, read fresh from GitHub, with what shep did about each (spec 124).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { FetchPrCommentsUseCase } from '@/application/use-cases/pr-comments/fetch-pr-comments.use-case.js';
import { GetPrCommentsUseCase } from '@/application/use-cases/pr-comments/get-pr-comments.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { refused, runCommand } from '../command-result.js';
import { renderComment, renderRound } from './render-pr-comments.js';

export function createCommentsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('comments')
    .description(t('cli:commands.feat.comments.description'))
    .argument('<feature>', t('cli:commands.feat.comments.featureArg'))
    .option('--no-refresh', t('cli:commands.feat.comments.noRefreshOption'))
    .action((feature: string, options: { refresh: boolean }) =>
      runCommand('cli:commands.feat.comments.failed', async () => {
        if (options.refresh) {
          const fetched = await container.resolve(FetchPrCommentsUseCase).execute(feature);
          if (refused(fetched)) return;
        }
        const result = await container.resolve(GetPrCommentsUseCase).execute(feature);
        if (refused(result)) return;

        messages.info(t('cli:commands.feat.comments.title', { name: result.feature.name }));
        if (result.comments.length === 0) {
          console.log(t('cli:commands.feat.comments.none'));
          return;
        }
        for (const comment of result.comments) {
          for (const line of renderComment(comment)) console.log(line);
        }
        const [latest] = result.rounds;
        if (latest) console.log(`\n${renderRound(latest)}`);
        console.log(`\n${t('cli:commands.feat.comments.next', { feature })}`);
      })
    );
}
