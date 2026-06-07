/**
 * IDE Open Command
 *
 * Opens a feature worktree in the configured IDE.
 * IDE flags (e.g. --vscode, --cursor) are derived dynamically from
 * the JSON tool metadata files in packages/core.
 *
 * Usage: shep ide <feat-id> [--<ide-name>]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { LaunchIdeUseCase } from '@/application/use-cases/ide/launch-ide.use-case.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { getIdeEntries } from '@/infrastructure/services/tool-installer/tool-metadata.js';
import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

/** Commander converts --kebab-case flags to camelCase option keys. */
function toCamelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Determine which editor to use based on CLI flags and settings.
 * Flag takes precedence over settings.
 */
function resolveEditorId(options: Record<string, boolean | undefined>, ideIds: string[]): string {
  for (const id of ideIds) {
    if (options[toCamelCase(id)]) return id;
  }
  return getSettings().environment.defaultEditor;
}

export function createIdeOpenCommand(): Command {
  const t = getCliI18n().t;
  const cmd = new Command('ide')
    .description(t('cli:commands.ide.description'))
    .argument('<feat-id>', t('cli:commands.ide.featArgument'));

  const ideEntries = getIdeEntries();
  const ideIds = ideEntries.map(([id]) => id);

  for (const [id, meta] of ideEntries) {
    cmd.option(`--${id}`, t('cli:commands.ide.openInOption', { name: meta.name }));
  }

  cmd.addHelpText(
    'after',
    `
Examples:
  $ shep ide feat-abc12345                Open the configured default editor
  $ shep ide feat-abc12345 --vscode        Force Visual Studio Code
  $ shep ide feat-abc12345 --cursor        Force Cursor`
  );

  cmd.action(async (featId: string, options: Record<string, boolean | undefined>) => {
    try {
      const editorId = resolveEditorId(options, ideIds);
      const showFeature = container.resolve(ShowFeatureUseCase);
      const feature = await showFeature.execute(featId);

      const launchIde = container.resolve(LaunchIdeUseCase);
      const result = await launchIde.execute({
        editorId,
        repositoryPath: feature.repositoryPath,
        branch: feature.branch,
      });

      if (!result.ok) {
        messages.error(result.message, new Error(result.message));
        process.exitCode = 1;
        return;
      }

      messages.success(
        t('cli:commands.ide.openedSuccess', {
          editor: result.editorName,
          path: result.worktreePath,
        })
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(t('cli:commands.ide.failedToOpen'), err);
      process.exitCode = 1;
    }
  });

  return cmd;
}
