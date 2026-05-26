import { Command } from 'commander';
import { container } from '../../../../infrastructure/container';
import { ListApplicationsUseCase } from '../../../../domain/usecases/app/list-applications.usecase';
import { getCliI18n } from '../../i18n';
import chalk from 'chalk';

function colorStatus(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green(status);
    case 'paused':
      return chalk.yellow(status);
    case 'archived':
      return chalk.gray(status);
    default:
      return status;
  }
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.app.ls.description'))
    .addHelpText(
      'after',
      `
Usage Examples:
  $ shep app ls
  $ shep app ls --json
`,
    )
    .action(async () => {
      try {
        const useCase = container.resolve(ListApplicationsUseCase);
        const apps = await useCase.execute();

        if (apps.length === 0) {
          console.log(chalk.yellow(t('cli:messages.noAppsFound')));
          return;
        }

        console.log(chalk.bold(`\n${t('cli:commands.app.ls.header')}\n`));
        console.log(
          chalk.bold(
            `${chalk.cyan(t('cli:commands.app.ls.idHeader').padEnd(8)}${chalk.green(t('cli:commands.app.ls.nameHeader')).padEnd(25)}${t('cli:commands.app.ls.statusHeader').padEnd(12)}${t('cli:commands.app.ls.updatedHeader')}`,
          ),
        );
        console.log(chalk.gray('??'.repeat(72)));

        for (const app of apps) {
          const updatedAt = app.updatedAt
            ? new Date(app.updatedAt).toLocaleString()
            : t('cli:commands.app.ls.never');

          console.log(
            `${app.id.slice(0, 8).padEnd(8)}${chalk.green(app.name.padEnd(25))}${colorStatus(app.status).padEnd(12)}${updatedAt}`,
          );
        }

        console.log(chalk.gray(`\n${t('cli:commands.app.ls.footer', { count: apps.length })}\n`));
      } catch (error) {
        console.error(
          chalk.red(t('cli:commands.app.ls.error')),
          error instanceof Error ? error.message : error,
        );
        process.exitCode = 1;
      }
    });
}
