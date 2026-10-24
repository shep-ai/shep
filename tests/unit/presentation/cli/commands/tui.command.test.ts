// @vitest-environment node

/**
 * `shep tui` command Unit Tests (spec 142)
 *
 * The command only wires: it refuses to run without an interactive terminal,
 * and otherwise hands the console app the three use cases as functions.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';

import { createTuiCommand } from '../../../../../src/presentation/cli/commands/tui.command.js';
import { initI18n as initCliI18n } from '@/presentation/cli/i18n.js';
import { initI18n as initTuiI18n } from '@/presentation/tui/i18n.js';
import { FeatureConsoleAction } from '@/domain/generated/output.js';
import type { FeatureConsoleAppDeps } from '@/presentation/tui/feature-console/feature-console.app.js';

describe('createTuiCommand', () => {
  let originalExitCode: typeof process.exitCode;
  let errors: string[];
  let useCases: {
    snapshot: { execute: ReturnType<typeof vi.fn> };
    action: { execute: ReturnType<typeof vi.fn> };
    logTail: { execute: ReturnType<typeof vi.fn> };
  };
  let runConsole: ReturnType<typeof vi.fn<(deps: FeatureConsoleAppDeps) => Promise<void>>>;

  beforeAll(async () => {
    await Promise.all([initCliI18n('en'), initTuiI18n('en')]);
  });

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
    errors = [];
    useCases = {
      snapshot: { execute: vi.fn(async () => ({ rows: [] })) },
      action: { execute: vi.fn(async () => ({ ok: true, message: 'done' })) },
      logTail: { execute: vi.fn(async () => ({ lines: [] })) },
    };
    runConsole = vi.fn(async () => undefined);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  const command = (interactive: boolean) =>
    createTuiCommand({
      isInteractive: () => interactive,
      resolveUseCases: () => useCases as never,
      runConsole,
      createTerminal: () => ({}) as never,
      err: (line) => errors.push(line),
    });

  it('refuses to start without an interactive terminal', async () => {
    await command(false).parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('shep feat ls');
    expect(runConsole).not.toHaveBeenCalled();
  });

  it('hands the console the snapshot, action and log-tail use cases', async () => {
    await command(true).parseAsync(['node', 'shep']);

    expect(runConsole).toHaveBeenCalledTimes(1);
    const deps = runConsole.mock.calls[0][0];

    await deps.loadSnapshot();
    expect(useCases.snapshot.execute).toHaveBeenCalledWith({});

    await deps.runAction('feat-1', FeatureConsoleAction.Reject, 'too broad');
    expect(useCases.action.execute).toHaveBeenCalledWith({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Reject,
      feedback: 'too broad',
    });

    await deps.loadLogTail('feat-1', 50);
    expect(useCases.logTail.execute).toHaveBeenCalledWith('feat-1', 50);
  });

  it('scopes to a repository with --repo, resolved and with forward slashes', async () => {
    await command(true).parseAsync(['node', 'shep', '--repo', 'some/repo', '--all']);

    await runConsole.mock.calls[0][0].loadSnapshot();
    expect(useCases.snapshot.execute).toHaveBeenCalledWith({
      repositoryPath: resolve('some/repo').replace(/\\/g, '/'),
      includeArchived: true,
    });
  });
});
