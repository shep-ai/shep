// @vitest-environment node

/**
 * `shep tui` command Unit Tests (specs 142, 143, 146, 147)
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
import {
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePanePlacement,
} from '@/domain/generated/output.js';
import type { FeatureConsoleAppDeps } from '@/presentation/tui/feature-console/feature-console.app.js';

describe('createTuiCommand', () => {
  let originalExitCode: typeof process.exitCode;
  let errors: string[];
  let useCases: {
    snapshot: { execute: ReturnType<typeof vi.fn> };
    action: { execute: ReturnType<typeof vi.fn> };
    logTail: { execute: ReturnType<typeof vi.fn> };
    queuePause: { execute: ReturnType<typeof vi.fn> };
    pane: { execute: ReturnType<typeof vi.fn> };
    controlCenter: { execute: ReturnType<typeof vi.fn> };
    multiplexerStatus: { execute: ReturnType<typeof vi.fn> };
    chat: { execute: ReturnType<typeof vi.fn> };
    sendChat: { execute: ReturnType<typeof vi.fn> };
    answerChat: { execute: ReturnType<typeof vi.fn> };
    stopChats: { execute: ReturnType<typeof vi.fn> };
  };
  let printed: string[];
  let written: string[];
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
      queuePause: { execute: vi.fn(async () => null) },
      pane: { execute: vi.fn(async () => ({ outcome: 'opened', message: 'ok' })) },
      controlCenter: { execute: vi.fn(async () => ({ windows: [] })) },
      multiplexerStatus: { execute: vi.fn(async () => ({ goneWindowIds: [] })) },
      chat: { execute: vi.fn(async () => ({ entries: [] })) },
      sendChat: { execute: vi.fn(async () => ({ ok: true, message: 'Sent' })) },
      answerChat: { execute: vi.fn(async () => ({ ok: true, message: 'Answered' })) },
      stopChats: { execute: vi.fn(async () => undefined) },
    };
    printed = [];
    written = [];
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
      createTerminal: () => ({ write: (data: string) => written.push(data) }) as never,
      err: (line) => errors.push(line),
      shepCommand: () => ['/usr/bin/node', '/opt/shep/cli.js'],
      environment: () => ({ SHEP_HOME: '/tmp/shep-home', TERM_PROGRAM: 'iTerm.app', PATH: '/bin' }),
      out: (line) => printed.push(line),
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

  it('opens panes with the command that runs this CLI and the SHEP_HOME it uses (spec 143)', async () => {
    await command(true).parseAsync(['node', 'shep']);

    await runConsole.mock.calls[0][0].openPane(
      'feat-1',
      FeaturePaneContent.Log,
      FeaturePanePlacement.Split
    );
    expect(useCases.pane.execute).toHaveBeenCalledWith({
      featureId: 'feat-1',
      content: FeaturePaneContent.Log,
      placement: FeaturePanePlacement.Split,
      shepCommand: ['/usr/bin/node', '/opt/shep/cli.js'],
      environment: { SHEP_HOME: '/tmp/shep-home' },
    });
  });

  it('alerts through the terminal, unless --no-notify', async () => {
    await command(true).parseAsync(['node', 'shep']);
    runConsole.mock.calls[0][0].notify?.('Billing needs you');
    expect(written).toEqual(['\x1b]9;shep: Billing needs you\x07']);

    await command(true).parseAsync(['node', 'shep', '--no-notify']);
    expect(runConsole.mock.calls[1][0].notify).toBeUndefined();
  });

  it('wires the control center and multiplexer status use cases (spec 146)', async () => {
    await command(true).parseAsync(['node', 'shep']);
    const deps = runConsole.mock.calls[0][0];

    await deps.openControlCenter([{ featureId: 'f1', title: '● Billing' }]);
    expect(useCases.controlCenter.execute).toHaveBeenCalledWith({
      features: [{ featureId: 'f1', title: '● Billing' }],
      shepCommand: ['/usr/bin/node', '/opt/shep/cli.js'],
      environment: { SHEP_HOME: '/tmp/shep-home' },
    });
    await deps.updateMultiplexer({ renames: [] });
    expect(useCases.multiplexerStatus.execute).toHaveBeenCalledWith({ renames: [] });
  });

  it('prints the status segment with --status, without a TTY or the console (spec 146)', async () => {
    const summary = { total: 3, needsAttention: 1, running: 2, waiting: 0, failed: 0, done: 0 };
    useCases.snapshot.execute.mockResolvedValue({ rows: [], summary });

    await command(false).parseAsync(['node', 'shep', '--status']);
    await command(false).parseAsync(['node', 'shep', '--status', 'tmux']);

    expect(runConsole).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(printed).toEqual([
      '◆ 1 needs you · ● 2 running',
      '#[fg=yellow,bold]◆ 1 needs you#[default] · #[fg=cyan]● 2 running#[default]',
    ]);
  });

  it('refuses an unknown --status style', async () => {
    await command(false).parseAsync(['node', 'shep', '--status', 'neon']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('plain, tmux');
  });

  it('wires the feature chat use cases (spec 147)', async () => {
    await command(true).parseAsync(['node', 'shep']);
    const deps = runConsole.mock.calls[0][0];

    await deps.loadChat('f1', 100);
    expect(useCases.chat.execute).toHaveBeenCalledWith({ featureId: 'f1', maxEntries: 100 });
    await deps.sendChatMessage('f1', 'hi');
    expect(useCases.sendChat.execute).toHaveBeenCalledWith({ featureId: 'f1', content: 'hi' });
    await deps.answerChatQuestion('f1', { q: 'a' });
    expect(useCases.answerChat.execute).toHaveBeenCalledWith({
      featureId: 'f1',
      answers: { q: 'a' },
    });
    await deps.stopChats(['f1']);
    expect(useCases.stopChats.execute).toHaveBeenCalledWith(['f1']);
  });

  it('releases the paused queue through SetFleetQueuePauseUseCase (spec 148)', async () => {
    await command(true).parseAsync(['node', 'shep']);

    const result = await runConsole.mock.calls[0][0].releaseQueue();

    expect(useCases.queuePause.execute).toHaveBeenCalledWith({ paused: false });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Queue released');
  });

  it('reports a failed release instead of throwing at the console', async () => {
    useCases.queuePause.execute.mockRejectedValue(new Error('Settings not found'));

    await command(true).parseAsync(['node', 'shep']);
    const result = await runConsole.mock.calls[0][0].releaseQueue();

    expect(result).toEqual({ ok: false, message: 'Settings not found' });
  });
});
