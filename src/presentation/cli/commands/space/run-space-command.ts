/** `shep space` subcommands run through the shared command plumbing. */

import { runCommand } from '../command-result.js';

export { report } from '../command-result.js';

export function runSpaceCommand(body: () => Promise<void>): Promise<void> {
  return runCommand('cli:commands.space.failed', body);
}
