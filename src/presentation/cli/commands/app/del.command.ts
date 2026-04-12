/**
 * Application Delete Command
 *
 * Soft-deletes an application and stops any active session.
 *
 * Usage: shep app del <id> [--force]
 *
 * @example
 * $ shep app del a1b2c3d4
 * $ shep app del a1b2c3d4 --force
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeleteApplicationUseCase } from '@/application/use-cases/applications/delete-application.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { confirm } from '@inquirer/prompts';
import { resolveApplication } from './resolve-application.js';
import { getCliI18n } from '../../i18n.js';

interface DelOptions {
  force?: boolean;
}

export function createDelCommand(): Command {
  const t = getCliI18n().t;
  return new Command('del')
    .description(t('cli:commands.app.del.description'))
    .argument('<id>', t('cli:commands.app.del.idArgument'))
    .option('-f, --force', t('cli:commands.app.del.forceOption'))
    .action(async (id: string, options: DelOptions) => {
      try {
        const resolved = await resolveApplication(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const app = resolved.application;

        if (!options.force) {
          const confirmed = await confirm({
            message: t('cli:commands.app.del.confirmDelete', { name: app.name }),
            default: false,
          });
          if (!confirmed) {
            messages.info(t('cli:commands.app.del.cancelled'));
            return;
          }
        }

        const deleteUseCase = container.resolve(DeleteApplicationUseCase);
        await deleteUseCase.execute(app.id);

        messages.newline();
        messages.success(t('cli:commands.app.del.appDeleted'));
        console.log(`  ${colors.muted(t('cli:commands.app.del.nameLabel'))} ${app.name}`);
        console.log(`  ${colors.muted(t('cli:commands.app.del.slugLabel'))} ${app.slug}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.app.del.failedToDelete'), err);
        process.exitCode = 1;
      }
    });
}
