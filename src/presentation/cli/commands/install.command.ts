/**
 * Install Command
 *
 * Installs a development tool (IDE or CLI agent) on the system.
 *
 * Usage:
 *   shep install <tool>           Install a tool
 *   shep install <tool> --how     Show installation instructions without executing
 *
 * Available tools are loaded dynamically from JSON files in the tools/ directory.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ValidateToolAvailabilityUseCase } from '@/application/use-cases/tools/validate-tool-availability.use-case.js';
import { InstallToolUseCase } from '@/application/use-cases/tools/install-tool.use-case.js';
import { TOOL_METADATA } from '@/infrastructure/services/tool-installer/tool-metadata.js';
import { messages, fmt, colors } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

interface InstallOptions {
  how?: boolean;
}

function printToolsList(): void {
  const tools = Object.entries(TOOL_METADATA).sort(([a], [b]) => a.localeCompare(b));

  for (const [key, meta] of tools) {
    const tags = meta.tags.map((t) => t).join(', ');
    console.log(
      `  ${colors.accent(key.padEnd(16))}${meta.name} - ${colors.muted(meta.summary)}  ${colors.muted(`[${tags}]`)}`
    );
  }
  console.log();
}

export function createInstallCommand(): Command {
  const t = getCliI18n().t;
  return new Command('install')
    .description(t('cli:commands.install.description'))
    .argument(
      '[tool]',
      t('cli:commands.install.toolArgument', {
        tools: Object.keys(TOOL_METADATA).sort().join(', '),
      })
    )
    .option('--how', t('cli:commands.install.howOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep install                  List available tools
  $ shep install claude-code      Install Claude Code
  $ shep install claude-code --how Show installation instructions only`
    )
    .action(async (tool: string | undefined, options: InstallOptions) => {
      try {
        // No tool specified — show available tools
        if (!tool) {
          console.log();
          console.log(
            t('cli:commands.install.runWithTool', { command: fmt.code('shep install <tool>') })
          );
          console.log();
          printToolsList();
          return;
        }

        // Validate tool name
        const metadata = TOOL_METADATA[tool];
        if (!metadata) {
          console.log();
          console.log(t('cli:commands.install.unrecognizedTool', { tool }));
          console.log();
          printToolsList();
          process.exitCode = 1;
          return;
        }

        if (options.how) {
          // Print installation instructions without executing
          printInstallInstructions(metadata);
          return;
        }

        // Check availability first
        const validateUseCase = container.resolve(ValidateToolAvailabilityUseCase);
        const status = await validateUseCase.execute(tool);

        if (status.status === 'available') {
          messages.success(t('cli:commands.install.alreadyInstalled', { tool }));
          return;
        }

        // Tools that don't support auto-install — show instructions instead
        if (metadata.autoInstall === false) {
          messages.warning(t('cli:commands.install.noAutoInstall', { tool }));
          printInstallInstructions(metadata);
          return;
        }

        // Install
        const installUseCase = container.resolve(InstallToolUseCase);
        const result = await installUseCase.execute(tool, (data) => process.stdout.write(data));

        if (result.status === 'available') {
          messages.success(t('cli:commands.install.installSuccess', { tool }));
        } else {
          messages.error(
            t('cli:commands.install.installFailed', {
              tool,
              error: result.errorMessage ?? 'Unknown error',
            }),
            new Error(result.errorMessage ?? 'Installation failed')
          );
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.install.failedToInstall', { tool }), err);
        process.exitCode = 1;
      }
    });
}

/**
 * Print installation instructions for a tool
 */
function printInstallInstructions(metadata: (typeof TOOL_METADATA)[keyof typeof TOOL_METADATA]) {
  const t = getCliI18n().t;
  console.log();
  console.log(fmt.heading(t('cli:commands.install.instructionsHeading', { name: metadata.name })));
  console.log();
  console.log(`${fmt.label(t('cli:commands.install.nameLabel'))} ${metadata.name}`);
  console.log(`${fmt.label(t('cli:commands.install.summaryLabel'))} ${metadata.summary}`);
  console.log(`${fmt.label(t('cli:commands.install.descriptionLabel'))} ${metadata.description}`);
  console.log(`${fmt.label(t('cli:commands.install.tagsLabel'))} ${metadata.tags.join(', ')}`);
  console.log();

  const binaryDisplay =
    typeof metadata.binary === 'string'
      ? metadata.binary
      : Object.entries(metadata.binary)
          .map(([platform, bin]) => `${bin} (${platform})`)
          .join(', ');
  console.log(`${fmt.label(t('cli:commands.install.binaryLabel'))} ${binaryDisplay}`);
  console.log(
    `${fmt.label(t('cli:commands.install.packageManagerLabel'))} ${metadata.packageManager}`
  );
  console.log();

  // Print platform-specific commands
  console.log(fmt.heading(t('cli:commands.install.installCommandsHeading')));
  for (const [platform, command] of Object.entries(metadata.commands)) {
    console.log(`${colors.muted(`[${platform}]`)} ${command}`);
  }
  console.log();

  // Print verify command
  console.log(fmt.heading(t('cli:commands.install.verifyHeading')));
  console.log(`${colors.muted('$')} ${metadata.verifyCommand}`);
  console.log();

  // Print open directory command if available
  if (metadata.openDirectory) {
    console.log(fmt.heading(t('cli:commands.install.openDirHeading')));
    console.log(`${colors.muted('$')} ${metadata.openDirectory}`);
    console.log();
  }

  // Print documentation link
  console.log(fmt.heading(t('cli:commands.install.docsHeading')));
  console.log(`${colors.muted('→')} ${metadata.documentationUrl}`);
  console.log();
}
