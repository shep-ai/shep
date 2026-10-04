/**
 * shep feat address-comments <feature> [comments...] — an agent addresses the
 * pending review comments in the feature's worktree, pushes, and shep replies
 * on each (spec 124).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { FetchPrCommentsUseCase } from '@/application/use-cases/pr-comments/fetch-pr-comments.use-case.js';
import { AddressPrCommentsUseCase } from '@/application/use-cases/pr-comments/address-pr-comments.use-case.js';
import { GetPrCommentsUseCase } from '@/application/use-cases/pr-comments/get-pr-comments.use-case.js';
import { PrCommentRoundStatus } from '@/domain/generated/output.js';
import { messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { refused, runCommand } from '../command-result.js';
import { renderComment, renderRound } from './render-pr-comments.js';

export function createAddressCommentsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('address-comments')
    .description(t('cli:commands.feat.addressComments.description'))
    .argument('<feature>', t('cli:commands.feat.comments.featureArg'))
    .argument('[comments...]', t('cli:commands.feat.addressComments.commentsArg'))
    .option('--no-refresh', t('cli:commands.feat.comments.noRefreshOption'))
    .action((feature: string, commentIds: string[], options: { refresh: boolean }) =>
      runCommand('cli:commands.feat.comments.failed', async () => {
        if (options.refresh) {
          const fetched = await container.resolve(FetchPrCommentsUseCase).execute(feature);
          if (refused(fetched)) return;
        }
        const useCase = container.resolve(AddressPrCommentsUseCase);
        const started = await useCase.start({
          feature,
          ...(commentIds.length > 0 ? { commentIds } : {}),
        });
        if (refused(started)) return;

        const round = await spinner(
          t('cli:commands.feat.addressComments.spinner', { count: started.comments.length }),
          () => useCase.run(started.round.id)
        );
        const after = await container.resolve(GetPrCommentsUseCase).execute(feature);
        if (after.ok) {
          for (const comment of after.comments.filter((c) => c.roundId === round.id)) {
            for (const line of renderComment(comment)) console.log(line);
          }
        }
        if (round.status === PrCommentRoundStatus.Failed) {
          messages.error(renderRound(round));
          process.exitCode = 1;
          return;
        }
        messages.success(renderRound(round));
      })
    );
}
