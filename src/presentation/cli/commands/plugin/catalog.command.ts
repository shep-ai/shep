/**
 * Plugin Catalog Command
 *
 * Browse available plugins from the curated catalog.
 *
 * Usage:
 *   shep plugin catalog
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPluginCatalogUseCase } from '@/application/use-cases/plugins/get-plugin-catalog.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createCatalogCommand(): Command {
  const t = getCliI18n().t;
  return new Command('catalog')
    .description(t('cli:commands.plugin.catalog.description'))
    .action(async () => {
      try {
        const useCase = container.resolve(GetPluginCatalogUseCase);
        const entries = await useCase.execute();

        renderListView({
          title: t('cli:commands.plugin.catalog.title'),
          columns: [
            { label: t('cli:commands.plugin.catalog.nameColumn'), width: 20 },
            { label: t('cli:commands.plugin.catalog.typeColumn'), width: 8 },
            { label: t('cli:commands.plugin.catalog.statusColumn'), width: 12 },
            { label: t('cli:commands.plugin.catalog.descriptionColumn'), width: 50 },
          ],
          rows: entries.map((e) => [
            e.name,
            e.type,
            e.isInstalled
              ? colors.success(t('cli:commands.plugin.catalog.installed'))
              : colors.muted(t('cli:commands.plugin.catalog.available')),
            colors.muted(e.description),
          ]),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.catalog.failed'), err);
        process.exitCode = 1;
      }
    });
}
