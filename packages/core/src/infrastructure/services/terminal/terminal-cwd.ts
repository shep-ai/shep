/**
 * Working-directory validation for terminal sessions.
 */

import { statSync } from 'node:fs';

/**
 * Throw a user-readable error unless `cwd` is an existing, accessible
 * directory. Checked before spawning so a bad path surfaces as a clear
 * message instead of an opaque `posix_spawn` / ConPTY failure.
 */
export function assertUsableCwd(cwd: string): void {
  // Validate cwd exists and is accessible before spawning to prevent posix_spawn errors.
  // Only the stat call is guarded — putting the isDirectory check inside the try would
  // make its own throw fall through to the generic "Cannot access" branch below.
  let stat;
  try {
    stat = statSync(cwd);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }
      if (code === 'EACCES') {
        throw new Error(`Permission denied accessing working directory: ${cwd}`);
      }
    }
    throw new Error(`Cannot access working directory: ${cwd}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${cwd}`);
  }
}
