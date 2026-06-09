/**
 * Plugin Status Command
 *
 * Show detailed health status of a plugin or all plugins.
 *
 * Usage:
 *   shep plugin status mempalace   # Check specific plugin
 *   shep plugin status             # Check all plugins
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CheckPluginHealthUseCase } from '@/application/use-cases/plugins/check-plugin-health.use-case.js';
import { ListPluginsUseCase } from '@/application/use-cases/plugins/list-plugins.use-case.js';
import { PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';
import { colors, messages, renderDetailView, renderListView } from '../../ui/index.js';
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

function buildPluginDetailSections(plugin: Plugin, t: (key: string) => string) {
  const fields = [
    { label: t('cli:commands.plugin.status.nameLabel'), value: plugin.name },
    { label: t('cli:commands.plugin.status.typeLabel'), value: plugin.type },
    { label: t('cli:commands.plugin.status.healthLabel'), value: colorHealth(plugin.healthStatus) },
    {
      label: t('cli:commands.plugin.status.messageLabel'),
      value: plugin.healthMessage ?? colors.muted('none'),
    },
    {
      label: t('cli:commands.plugin.status.enabledLabel'),
      value: plugin.enabled ? colors.success('Yes') : colors.muted('No'),
    },
  ];

  if (plugin.runtimeType) {
    const version = plugin.runtimeMinVersion ? ` ${plugin.runtimeMinVersion}+` : '';
    fields.push({
      label: t('cli:commands.plugin.status.runtimeLabel'),
      value: `${plugin.runtimeType}${version}`,
    });
  }

  if (plugin.transport) {
    fields.push({
      label: t('cli:commands.plugin.status.transportLabel'),
      value: plugin.transport,
    });
  }

  if (plugin.requiredEnvVars?.length) {
    fields.push({
      label: t('cli:commands.plugin.status.envVarsLabel'),
      value: plugin.requiredEnvVars.join(', '),
    });
  }

  if (plugin.toolGroups?.length) {
    fields.push({
      label: t('cli:commands.plugin.status.toolGroupsLabel'),
      value: plugin.toolGroups.map((g) => g.name).join(', '),
    });
  }

  if (plugin.activeToolGroups?.length) {
    fields.push({
      label: t('cli:commands.plugin.status.activeGroupsLabel'),
      value: plugin.activeToolGroups.join(', '),
    });
  }

  return [{ fields }];
}

export function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return new Command('status')
    .description(t('cli:commands.plugin.status.description'))
    .argument('[name]', t('cli:commands.plugin.status.nameArg'))
    .action(async (name?: string) => {
      try {
        const healthUseCase = container.resolve(CheckPluginHealthUseCase);
        const results = await healthUseCase.execute(name);

        if (name) {
          // Detailed view for single plugin
          const listUseCase = container.resolve(ListPluginsUseCase);
          const plugins = await listUseCase.execute();
          const plugin = plugins.find((p) => p.name === name);

          if (plugin) {
            // Update health from fresh results
            const updatedPlugin = {
              ...plugin,
              healthStatus: results[0].status,
              healthMessage: results[0].message,
            };
            renderDetailView({
              title: t('cli:commands.plugin.status.title'),
              sections: buildPluginDetailSections(updatedPlugin, t),
            });
          }
        } else {
          // List view for all plugins
          if (results.length === 0) {
            messages.info(t('cli:commands.plugin.status.noPlugins'));
            return;
          }

          renderListView({
            title: t('cli:commands.plugin.status.allTitle'),
            columns: [
              { label: t('cli:commands.plugin.status.nameLabel'), width: 20 },
              { label: t('cli:commands.plugin.status.healthLabel'), width: 14 },
              { label: t('cli:commands.plugin.status.messageLabel'), width: 40 },
            ],
            rows: results.map((r) => [r.pluginName, colorHealth(r.status), r.message]),
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.status.failed'), err);
        process.exitCode = 1;
      }
    });
}
