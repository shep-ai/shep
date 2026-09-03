/**
 * Feat Command Group Unit Tests
 *
 * Validates the feat command group structure and enriched CLI help examples.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

// Mock DI container and use cases to keep unit test isolated
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn(() => false),
  getSettings: vi.fn(() => ({})),
}));

import { createFeatCommand } from '../../../../../../src/presentation/cli/commands/feat/index.js';
import { createNewCommand } from '../../../../../../src/presentation/cli/commands/feat/new.command.js';
import { createLsCommand } from '../../../../../../src/presentation/cli/commands/feat/ls.command.js';
import { createShowCommand } from '../../../../../../src/presentation/cli/commands/feat/show.command.js';
import { createStartCommand } from '../../../../../../src/presentation/cli/commands/feat/start.command.js';
import { createResumeCommand } from '../../../../../../src/presentation/cli/commands/feat/resume.command.js';
import { createLogsCommand } from '../../../../../../src/presentation/cli/commands/feat/logs.command.js';

function getFullHelp(cmd: Command): string {
  let output = '';
  cmd.configureOutput({
    writeOut: (str) => {
      output += str;
    },
    writeErr: (str) => {
      output += str;
    },
  });
  cmd.outputHelp();
  return output;
}

describe('Feat Command Group', () => {
  describe('createFeatCommand', () => {
    it('should create a valid Commander command with name "feat"', () => {
      const cmd = createFeatCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('feat');
    });

    it('should include enriched help text examples after command help', () => {
      const cmd = createFeatCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat new');
      expect(help).toContain('shep feat ls');
      expect(help).toContain('shep feat show');
    });

    it('should register all expected SDLC lifecycle subcommands', () => {
      const cmd = createFeatCommand();
      const subcommands = cmd.commands.map((c) => c.name());
      expect(subcommands).toContain('new');
      expect(subcommands).toContain('ls');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('del');
      expect(subcommands).toContain('start');
      expect(subcommands).toContain('resume');
      expect(subcommands).toContain('logs');
      expect(subcommands).toContain('approve');
      expect(subcommands).toContain('reject');
    });
  });

  describe('Subcommand Help Examples', () => {
    it('createNewCommand should include descriptive help examples', () => {
      const cmd = createNewCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat new');
    });

    it('createLsCommand should include descriptive help examples', () => {
      const cmd = createLsCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat ls');
    });

    it('createShowCommand should include descriptive help examples', () => {
      const cmd = createShowCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat show');
    });

    it('createStartCommand should include descriptive help examples', () => {
      const cmd = createStartCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat start');
    });

    it('createResumeCommand should include descriptive help examples', () => {
      const cmd = createResumeCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat resume');
    });

    it('createLogsCommand should include descriptive help examples', () => {
      const cmd = createLogsCommand();
      const help = getFullHelp(cmd);
      expect(help).toContain('Examples:');
      expect(help).toContain('shep feat logs');
    });
  });
});
