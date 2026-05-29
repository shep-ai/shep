/**
 * Version Command
 *
 * Displays detailed version information for Shep AI CLI.
 * Provides more context than the --version flag.
 *
 * Usage: shep version
 *
 * @example
 * $ shep version
 * @shepai/cli v0.1.0
 * Autonomous AI Native SDLC Platform
 *
 * Node:     v20.10.0
 * Platform: linux x64
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import { colors, fmt, messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

/**
 * Create the version command
 */
export function createVersionCommand(): Command {
  const t = getCliI18n().t;
  return new Command('version')
    .description(t('cli:commands.version.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep version                  Show detailed version information
  $ shep --version                Show version number only
  $ shep version                  Includes Node.js and platform details`
    )
    .action(() => {
      const versionService = container.resolve<IVersionService>('IVersionService');
      const info = versionService.getVersion();

      messages.newline();
      console.log(`${fmt.heading(info.name)} ${fmt.version(info.version)}`);
      console.log(colors.muted(info.description));
      messages.newline();
      console.log(`${fmt.label(t('cli:commands.version.nodeLabel'))}     ${process.version}`);
      console.log(
        `${fmt.label(t('cli:commands.version.platformLabel'))} ${process.platform} ${process.arch}`
      );
      messages.newline();
    });
}
