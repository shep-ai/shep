/**
 * Worktree Provisioning Config Rules
 *
 * The single place that decides what a `WorktreeConfig` means. Every surface
 * that reads or writes `settings.worktree` — the SQLite mapper, the hook
 * runner, the CLI `settings worktree` command, the web Settings section —
 * goes through these helpers so "blank means unset" and "what is the default
 * timeout" have exactly one definition.
 */

import type { WorktreeConfig } from '../generated/output';

/**
 * Timeout applied to each worktree command when the user has not set one.
 * Generous by design: a post-create hook may run a dependency install.
 */
export const DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS = 300_000;

/**
 * Normalize a worktree config to its canonical form.
 *
 * - Commands are trimmed; blank or whitespace-only commands are dropped, so
 *   clearing a field anywhere restores the built-in `git worktree add`.
 * - A non-positive or non-finite timeout is dropped in favour of the default.
 * - Returns `undefined` when nothing is left, which is how "not configured"
 *   is represented on `Settings.worktree`.
 */
export function normalizeWorktreeConfig(
  config: WorktreeConfig | undefined
): WorktreeConfig | undefined {
  if (!config) return undefined;

  const createCommand = normalizeCommand(config.createCommand);
  const postCreateCommand = normalizeCommand(config.postCreateCommand);
  const commandTimeoutMs = normalizeTimeoutMs(config.commandTimeoutMs);

  if (
    createCommand === undefined &&
    postCreateCommand === undefined &&
    commandTimeoutMs === undefined
  ) {
    return undefined;
  }

  return {
    ...(createCommand !== undefined && { createCommand }),
    ...(postCreateCommand !== undefined && { postCreateCommand }),
    ...(commandTimeoutMs !== undefined && { commandTimeoutMs }),
  };
}

/** The timeout to apply to each worktree command for the given config. */
export function resolveWorktreeCommandTimeoutMs(config: WorktreeConfig | undefined): number {
  return normalizeTimeoutMs(config?.commandTimeoutMs) ?? DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS;
}

function normalizeCommand(command: string | undefined): string | undefined {
  const trimmed = command?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined) return undefined;
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined;
}
