/**
 * shep space show [path] — which space and product line a repository is in,
 * and why (explicit assignment, a rule, or the default).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { SpaceResolutionSource } from '@/domain/generated/output.js';
import { colors, renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { resolveCliPath } from '../../paths.js';
import { runSpaceCommand } from './run-space-command.js';

const SOURCE_KEY: Record<SpaceResolutionSource, string> = {
  [SpaceResolutionSource.Assignment]: 'cli:commands.space.show.sourceAssignment',
  [SpaceResolutionSource.Rule]: 'cli:commands.space.show.sourceRule',
  [SpaceResolutionSource.Default]: 'cli:commands.space.show.sourceDefault',
};

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.space.show.description'))
    .argument('[path]', t('cli:commands.space.pathArg'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space show                 Where the current repository lands
  $ shep space show ~/work/api      Where another repository lands`
    )
    .action((path: string | undefined) =>
      runSpaceCommand(async () => {
        const context = await container
          .resolve(ResolveSpaceContextUseCase)
          .execute(resolveCliPath(path));
        renderDetailView({
          title: context.repositoryPath,
          sections: [
            {
              fields: [
                { label: t('cli:commands.space.show.space'), value: context.space.name },
                {
                  label: t('cli:commands.space.show.productLine'),
                  value: context.productLine?.name ?? colors.muted('-'),
                },
                {
                  label: t('cli:commands.space.show.source'),
                  value: t(SOURCE_KEY[context.source], {
                    kind: context.rule?.kind ?? '',
                    pattern: context.rule?.pattern ?? '',
                  }),
                },
              ],
            },
          ],
        });
      })
    );
}
