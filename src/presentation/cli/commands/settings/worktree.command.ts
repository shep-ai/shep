/**
 * Worktree Provisioning Configuration Command
 *
 * Configures the commands Shep uses to provision each feature worktree.
 * See docs/guides/custom-worktree-provisioning.md.
 *
 * Usage:
 *   shep settings worktree                                  # Show current config
 *   shep settings worktree --post-create-command "<cmd>"    # Run <cmd> inside each new worktree
 *   shep settings worktree --create-command "<cmd>"         # Replace `git worktree add`
 *   shep settings worktree --timeout 600000                 # Per-command timeout
 *   shep settings worktree --clear                          # Back to built-in git worktree
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { UpdateSettingsUseCase } from '@/application/use-cases/settings/update-settings.use-case.js';
import {
  getSettings,
  resetSettings,
  initializeSettings,
} from '@/infrastructure/services/settings.service.js';
import type { WorktreeConfig } from '@/domain/generated/output.js';
import {
  DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS,
  normalizeWorktreeConfig,
} from '@/domain/shared/worktree-config.js';
import { messages } from '../../ui/index.js';

/** Shown in place of an unset command. */
const NOT_CONFIGURED = '(not set — built-in git worktree)';

export interface WorktreeCommandOptions {
  createCommand?: string;
  postCreateCommand?: string;
  timeout?: string;
  clear?: boolean;
}

/**
 * Create the worktree provisioning configuration command.
 */
export function createWorktreeCommand(): Command {
  return new Command('worktree')
    .description('Configure custom worktree provisioning commands')
    .option('--create-command <cmd>', 'Command that replaces `git worktree add`')
    .option('--post-create-command <cmd>', 'Command run inside each new worktree')
    .option('--timeout <ms>', 'Timeout in milliseconds applied to each command')
    .option('--clear', 'Clear all worktree commands and use the built-in git worktree')
    .addHelpText(
      'after',
      `
Available in both commands:
  SHEP_REPO_PATH       Absolute path of the main repository
  SHEP_WORKTREE_PATH   Absolute path the worktree must exist at
  SHEP_BRANCH          Branch checked out in the worktree
  SHEP_START_POINT     Start ref for a new branch (empty if the branch exists)

Examples:
  $ shep settings worktree
  $ shep settings worktree --post-create-command 'ln -s "$SHEP_REPO_PATH/node_modules" node_modules'
  $ shep settings worktree --create-command 'my-tool worktree add "$SHEP_WORKTREE_PATH" "$SHEP_BRANCH"'
  $ shep settings worktree --timeout 900000
  $ shep settings worktree --clear`
    )
    .action(async (options: WorktreeCommandOptions) => {
      try {
        const settings = getSettings();

        const next = buildNextConfig(settings.worktree, options);
        if (next === null) {
          printConfig(settings.worktree);
          return;
        }

        if (next === undefined) {
          delete settings.worktree;
        } else {
          settings.worktree = next;
        }

        const useCase = container.resolve(UpdateSettingsUseCase);
        const updated = await useCase.execute(settings);

        resetSettings();
        initializeSettings(updated);

        messages.success('Worktree provisioning updated.');
        printConfig(updated.worktree);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to configure worktree provisioning', err);
        process.exitCode = 1;
      }
    });
}

/**
 * Apply the given options to the current config.
 *
 * Returns `null` when no option was supplied (read-only invocation),
 * `undefined` when the result is "nothing configured", and the normalized
 * config otherwise. An empty `--create-command ''` clears that command.
 */
export function buildNextConfig(
  current: WorktreeConfig | undefined,
  options: WorktreeCommandOptions
): WorktreeConfig | undefined | null {
  if (options.clear) return undefined;

  const hasChange =
    options.createCommand !== undefined ||
    options.postCreateCommand !== undefined ||
    options.timeout !== undefined;
  if (!hasChange) return null;

  const next: WorktreeConfig = { ...current };

  // An explicit empty string clears the command; normalizeWorktreeConfig drops it.
  if (options.createCommand !== undefined) next.createCommand = options.createCommand;
  if (options.postCreateCommand !== undefined) next.postCreateCommand = options.postCreateCommand;

  if (options.timeout !== undefined) {
    const parsed = Number.parseInt(options.timeout, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `--timeout must be a positive number of milliseconds, got "${options.timeout}"`
      );
    }
    next.commandTimeoutMs = parsed;
  }

  return normalizeWorktreeConfig(next);
}

function printConfig(worktree: WorktreeConfig | undefined): void {
  messages.info(`create command:      ${worktree?.createCommand ?? NOT_CONFIGURED}`);
  messages.info(`post-create command: ${worktree?.postCreateCommand ?? NOT_CONFIGURED}`);
  messages.info(
    `command timeout:     ${worktree?.commandTimeoutMs ?? DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS} ms`
  );
}
