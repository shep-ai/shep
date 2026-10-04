/**
 * Shared plumbing for `shep space` subcommands: turn a use-case result into
 * output and an exit code, and report unexpected errors the same way.
 */

import type { SpaceResult } from '@/application/use-cases/spaces/space-refs.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/** Run a subcommand body; an unexpected error prints and sets exit code 1. */
export async function runSpaceCommand(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    messages.error(getCliI18n().t('cli:commands.space.failed'), err);
    process.exitCode = 1;
  }
}

/** Print a refused result as an error (exit code 1), or hand a success on. */
export function report<T extends object>(
  result: SpaceResult<T>,
  onOk: (value: { ok: true } & T) => void
): void {
  if (!result.ok) {
    messages.error(result.error);
    process.exitCode = 1;
    return;
  }
  onOk(result);
}
