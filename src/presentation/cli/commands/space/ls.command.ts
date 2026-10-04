/**
 * shep space ls — every space with its product lines, repositories and memory.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetSpacesOverviewUseCase } from '@/application/use-cases/spaces/get-spaces-overview.use-case.js';
import { colors, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { runSpaceCommand } from './run-space-command.js';

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.space.ls.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space ls      List spaces, their product lines, repositories and memory`
    )
    .action(() =>
      runSpaceCommand(async () => {
        const { spaces } = await container.resolve(GetSpacesOverviewUseCase).execute();
        renderListView({
          title: t('cli:commands.space.ls.title'),
          columns: [
            { label: t('cli:commands.space.ls.nameColumn'), width: 22 },
            { label: t('cli:commands.space.ls.slugColumn'), width: 16 },
            { label: t('cli:commands.space.ls.linesColumn'), width: 28 },
            { label: t('cli:commands.space.ls.reposColumn'), width: 7 },
            { label: t('cli:commands.space.ls.memoryColumn'), width: 7 },
          ],
          rows: spaces.map(({ space, productLines, repositoryCount, memoryCount }) => [
            space.isDefault
              ? `${space.name} ${colors.muted(t('cli:commands.space.ls.defaultMarker'))}`
              : space.name,
            colors.muted(space.slug),
            productLines.map((line) => line.name).join(', ') || colors.muted('-'),
            String(repositoryCount),
            String(memoryCount),
          ]),
        });
      })
    );
}
