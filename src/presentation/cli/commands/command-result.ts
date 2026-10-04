/**
 * Shared plumbing for CLI commands backed by use cases that return
 * `{ ok: true, ... } | { ok: false, error }`: print a refusal as an error with
 * exit code 1, and report unexpected errors the same way everywhere.
 */

import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

export type UseCaseResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Run a command body; an unexpected error prints `failedKey` and sets exit code 1. */
export async function runCommand(failedKey: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    messages.error(getCliI18n().t(failedKey), err);
    process.exitCode = 1;
  }
}

/** Print a refused result as an error (exit code 1), or hand a success on. */
export function report<T extends object>(
  result: UseCaseResult<T>,
  onOk: (value: { ok: true } & T) => void
): void {
  if (!result.ok) {
    messages.error(result.error);
    process.exitCode = 1;
    return;
  }
  onOk(result);
}
