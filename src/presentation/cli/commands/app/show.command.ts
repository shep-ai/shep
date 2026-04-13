/**
 * Application Show Command
 *
 * Display details of a specific application.
 *
 * Usage:
 *   shep app show <id>
 */

import { Command } from 'commander';
import { colors, messages, renderDetailView } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';
import { getCliI18n } from '../../i18n.js';

function formatDate(date?: Date | string | null): string | null {
  if (!date) return null;
  try {
    return new Date(date).toLocaleString();
  } catch {
    return String(date);
  }
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.app.show.description'))
    .argument('<id>', t('cli:commands.app.show.idArgument'))
    .action(async (id: string) => {
      try {
        const resolved = await resolveApplication(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const app = resolved.application;

        renderDetailView({
          title: t('cli:commands.app.show.title', { name: app.name }),
          sections: [
            {
              fields: [
                { label: 'ID', value: app.id },
                { label: t('cli:commands.app.show.nameLabel'), value: app.name },
                { label: t('cli:commands.app.show.slugLabel'), value: app.slug },
                { label: t('cli:commands.app.show.statusLabel'), value: app.status },
                {
                  label: t('cli:commands.app.show.descriptionLabel'),
                  value: app.description,
                },
                {
                  label: t('cli:commands.app.show.pathLabel'),
                  value: app.repositoryPath,
                },
              ],
            },
            {
              title: t('cli:commands.app.show.configTitle'),
              fields: [
                {
                  label: t('cli:commands.app.show.agentLabel'),
                  value: app.agentType ?? colors.muted('default'),
                },
                {
                  label: t('cli:commands.app.show.modelLabel'),
                  value: app.modelOverride ?? colors.muted('default'),
                },
              ],
            },
            {
              title: t('cli:commands.app.show.timestampsTitle'),
              fields: [
                {
                  label: t('cli:commands.app.show.createdLabel'),
                  value: formatDate(app.createdAt),
                },
                {
                  label: t('cli:commands.app.show.updatedLabel'),
                  value: formatDate(app.updatedAt),
                },
                {
                  label: t('cli:commands.app.show.deletedLabel'),
                  value: formatDate(app.deletedAt),
                },
              ],
            },
          ],
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.app.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}
