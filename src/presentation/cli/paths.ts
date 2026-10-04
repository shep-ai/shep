/**
 * Path arguments for CLI commands.
 *
 * Shells expand `~` before argv, but a quoted `"~/Code"` and non-shell
 * invocations do not, so commands that take a path expand it themselves.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Expand a leading `~` (POSIX or Windows separator) to the home directory. */
export function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) return join(homedir(), input.slice(2));
  return input;
}

/** An absolute path for a path argument, defaulting to the working directory. */
export function resolveCliPath(input?: string): string {
  return resolve(expandHome(input?.trim() ? input.trim() : '.'));
}
