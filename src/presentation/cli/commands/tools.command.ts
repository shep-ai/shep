/**
 * Tools Command Group
 *
 * Provides subcommands for listing and managing development tools.
 *
 * Usage:
 *   shep tools list   # List all tools with their installed status
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListToolsUseCase } from '@/application/use-cases/tools/list-tools.use-case.js';
import { getCliI18n } from '../i18n.js';

/**
 * Create the tools command group
 */
export function createToolsCommand(): Command {
  const t = getCliI18n().t;
  const tools = new Command('tools').description(t('cli:commands.tools.description')).addHelpText(
    'after',
    `
Examples:
  $ shep tools                 Show available tools subcommands
  $ shep tools list            List tools and installation status
  $ shep tools list | grep missing`
  );

  tools
    .command('list')
    .description(t('cli:commands.tools.list.description'))
    .action(async () => {
      try {
        const listToolsUseCase = container.resolve(ListToolsUseCase);
        const result = await listToolsUseCase.execute();

        for (const tool of result) {
          const statusLabel =
            tool.status.status === 'available'
              ? t('cli:commands.tools.list.installed')
              : t('cli:commands.tools.list.missing');
          console.log(`[${statusLabel}]  ${tool.id}  ${tool.name}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(t('cli:commands.tools.list.failedToList', { error: err.message }));
        process.exitCode = 1;
      }
    });

  return tools;
}
