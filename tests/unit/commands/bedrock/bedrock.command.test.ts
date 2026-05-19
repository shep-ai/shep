/**
 * `shep bedrock` command group structure tests.
 *
 * Verifies the top-level command and four subcommands (init/sync/doctor/ship)
 * exist and are registered. This is the regression guard for task-17.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock the DI container so command factories construct without a real DB.
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockReturnValue({}),
  },
}));

// Mock CLI UI helpers to keep output deterministic.
vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
    log: vi.fn(),
  },
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
  },
  fmt: { code: (s: string) => s, heading: (s: string) => s, label: (s: string) => s },
  renderListView: vi.fn(),
}));

import { createBedrockCommand } from '../../../../src/presentation/cli/commands/bedrock/bedrock.command.js';

describe('shep bedrock command group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('returns a Commander Command instance', () => {
    const cmd = createBedrockCommand();
    expect(cmd).toBeInstanceOf(Command);
  });

  it('has name "bedrock"', () => {
    const cmd = createBedrockCommand();
    expect(cmd.name()).toBe('bedrock');
  });

  it('has a description', () => {
    const cmd = createBedrockCommand();
    expect(cmd.description()).toBeTruthy();
  });

  it.each([['init'], ['sync'], ['doctor'], ['ship']])(
    'registers a "%s" subcommand',
    (name: string) => {
      const cmd = createBedrockCommand();
      const names = cmd.commands.map((c) => c.name());
      expect(names).toContain(name);
    }
  );

  it('lists init/sync/doctor/ship in --help output', () => {
    const cmd = createBedrockCommand();
    const help = cmd.helpInformation();
    expect(help).toContain('init');
    expect(help).toContain('sync');
    expect(help).toContain('doctor');
    expect(help).toContain('ship');
  });
});
