/**
 * Inline command runner (spec 143).
 *
 * With no terminal multiplexer, the console stops drawing and lends its
 * terminal to a shell or a log follower. The child shares the terminal's
 * process group, so ctrl+c reaches the console too: it is ignored here until
 * the child exits, so it ends the command and not the console behind it.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { EOL } from 'node:os';
import type { InlineCommand } from './feature-console.app.js';

interface InlineChild {
  once(event: 'exit', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
}

export interface RunInlineIo {
  spawn: (
    command: string,
    args: string[],
    options: { cwd: string; stdio: 'inherit' }
  ) => InlineChild;
  write: (text: string) => void;
}

const defaultIo: RunInlineIo = {
  spawn: (command, args, options) => nodeSpawn(command, args, options),
  write: (text) => process.stdout.write(text),
};

const ignoreInterrupt = (): void => {
  // The child handles ctrl+c; the console waits for it to exit.
};

export function runInline(plan: InlineCommand, io: RunInlineIo = defaultIo): Promise<void> {
  const [command, ...args] = plan.command;
  io.write(`${EOL}${plan.banner}${EOL}${EOL}`);
  process.on('SIGINT', ignoreInterrupt);
  return new Promise<void>((resolve, reject) => {
    const child = io.spawn(command, args, { cwd: plan.cwd, stdio: 'inherit' });
    child.once('exit', () => {
      process.off('SIGINT', ignoreInterrupt);
      resolve();
    });
    child.once('error', (error) => {
      process.off('SIGINT', ignoreInterrupt);
      reject(error);
    });
  });
}
