/**
 * Plugin List Command
 *
 * List all installed plugins in a formatted table.
 *
 * Usage:
 *   shep plugin list
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListPluginsUseCase } from '@/application/use-cases/plugins/list-plugins.use-case.js';
import { PluginHealthStatus } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

function colorHealth(status: string): string {
  switch (status) {
    case PluginHealthStatus.Healthy:
      return colors.success(status);
    case PluginHealthStatus.Degraded:
      return colors.warning(status);
    case PluginHealthStatus.Unavailable:
      return colors.error(status);
    default:
      return colors.muted(status);
  }
}

function colorEnabled(enabled: boolean): string {
  return enabled ? colors.success('Enabled') : colors.muted('Disabled');
}

export function createListCommand(): Command {
  const t = getCliI18n().t;
  return new Command('list')
    .description(t('cli:commands.plugin.list.description'))
    .action(async () => {
      try {
        const useCase = container.resolve(ListPluginsUseCase);
        const plugins = await useCase.execute();

        renderListView({
          title: t('cli:commands.plugin.list.title'),
          columns: [
            { label: t('cli:commands.plugin.list.nameColumn'), width: 20 },
            { label: t('cli:commands.plugin.list.typeColumn'), width: 8 },
            { label: t('cli:commands.plugin.list.statusColumn'), width: 12 },
            { label: t('cli:commands.plugin.list.healthColumn'), width: 14 },
            { label: t('cli:commands.plugin.list.sourceColumn'), width: 10 },
          ],
          rows: plugins.map((p) => [
            p.name,
            p.type,
            colorEnabled(p.enabled),
            colorHealth(p.healthStatus),
            colors.muted(p.installSource ?? 'unknown'),
          ]),
          emptyMessage: t('cli:commands.plugin.list.noPlugins'),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.list.failed'), err);
        process.exitCode = 1;
      }
    });
}
