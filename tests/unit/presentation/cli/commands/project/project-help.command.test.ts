/**
 * Project subcommand help text unit tests
 *
 * Verifies that the four `shep project` subcommands expose copy-pasteable
 * Examples blocks via Commander's addHelpText('after', ...) hook.
 */

import { describe, it, expect } from 'vitest';
import type { Command } from 'commander';
import { createLsCommand } from '../../../../../../src/presentation/cli/commands/project/ls.command.js';
import { createNewCommand } from '../../../../../../src/presentation/cli/commands/project/new.command.js';
import { createShowCommand } from '../../../../../../src/presentation/cli/commands/project/show.command.js';
import { createDelCommand } from '../../../../../../src/presentation/cli/commands/project/del.command.js';

function captureHelp(cmd: Command): string {
  let helpOutput = '';
  cmd.configureOutput({ writeOut: (str) => (helpOutput += str) });
  cmd.outputHelp();
  return helpOutput;
}

describe('project subcommand help text', () => {
  it('ls --help includes an Examples block with shep project ls', () => {
    const helpOutput = captureHelp(createLsCommand());
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('shep project ls');
  });

  it('new --help includes examples for --name, --prefix, and --description flags', () => {
    const helpOutput = captureHelp(createNewCommand());
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('--name');
    expect(helpOutput).toContain('--prefix');
    expect(helpOutput).toContain('--description');
    expect(helpOutput).toContain('-n');
    expect(helpOutput).toContain('-p');
    expect(helpOutput).toContain('-d');
  });

  it('show --help includes an example with a <slug> argument', () => {
    const helpOutput = captureHelp(createShowCommand());
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('shep project show');
    expect(helpOutput).toContain('<slug>');
  });

  it('del --help includes confirm and --force examples', () => {
    const helpOutput = captureHelp(createDelCommand());
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('shep project del my-project');
    expect(helpOutput).toContain('--force');
  });
});
