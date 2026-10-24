/**
 * TerminalPaneLauncherService Unit Tests (spec 143)
 *
 * The adapter detects the multiplexer from its environment, runs the argv the
 * builders produce, and turns a refusal into a message the console can show.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { FeaturePanePlacement, TerminalMultiplexer } from '@/domain/generated/output.js';
import type { TerminalPaneRequest } from '@/application/ports/output/services/terminal-pane-launcher.interface.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';
import { TerminalPaneLauncherService } from '@/infrastructure/services/terminal-pane/terminal-pane-launcher.service.js';

function request(overrides: Partial<TerminalPaneRequest> = {}): TerminalPaneRequest {
  return {
    multiplexer: TerminalMultiplexer.Tmux,
    placement: FeaturePanePlacement.Split,
    cwd: '/work/wt',
    title: 'shep abc',
    environment: {},
    focus: true,
    ...overrides,
  };
}

function execFailing(error: Error & { stderr?: string; code?: string }) {
  return vi.fn(async () => {
    throw error;
  });
}

describe('TerminalPaneLauncherService', () => {
  it('detects the multiplexer from its environment', () => {
    const exec = vi.fn();
    expect(new TerminalPaneLauncherService(exec, { TMUX: 'x' }, false).detect()).toBe(
      TerminalMultiplexer.Tmux
    );
    expect(new TerminalPaneLauncherService(exec, {}, false).detect()).toBeUndefined();
  });

  it('runs the tmux command beside the calling pane', async () => {
    const exec = vi.fn(async () => ({ stdout: '%7\n', stderr: '' }));
    const launcher = new TerminalPaneLauncherService(exec, { TMUX: 'x', TMUX_PANE: '%2' }, false);

    await launcher.open(request());

    expect(exec).toHaveBeenCalledWith(
      'tmux',
      ['split-window', '-h', '-t', '%2', '-c', '/work/wt', '-P', '-F', '#{pane_id}'],
      { cwd: '/work/wt', windowsHide: true }
    );
  });

  it('splits beside the calling WezTerm pane', async () => {
    const exec = vi.fn<ExecFunction>(async () => ({ stdout: '9', stderr: '' }));
    const launcher = new TerminalPaneLauncherService(exec, { WEZTERM_PANE: '4' }, false);

    await launcher.open(request({ multiplexer: TerminalMultiplexer.WezTerm }));

    expect(exec.mock.calls[0][1]).toContain('--pane-id');
    expect(exec.mock.calls[0][1]).toContain('4');
  });

  it("reports the multiplexer's own error", async () => {
    const error = Object.assign(new Error('Command failed: tmux'), {
      stderr: 'no server running on /tmp/tmux-0/default\n',
    });
    const launcher = new TerminalPaneLauncherService(execFailing(error), { TMUX: 'x' }, false);

    await expect(launcher.open(request())).rejects.toThrow(
      'tmux: no server running on /tmp/tmux-0/default'
    );
  });

  it('says when the multiplexer CLI is not on the PATH', async () => {
    const error = Object.assign(new Error('spawn zellij ENOENT'), { code: 'ENOENT' });
    const launcher = new TerminalPaneLauncherService(execFailing(error), { ZELLIJ: '0' }, false);

    await expect(
      launcher.open(request({ multiplexer: TerminalMultiplexer.Zellij }))
    ).rejects.toThrow('zellij is not on the PATH');
  });

  it('explains kitty remote control when kitty refuses', async () => {
    const error = Object.assign(new Error('failed'), {
      stderr: 'Error: Remote control is disabled',
    });
    const launcher = new TerminalPaneLauncherService(
      execFailing(error),
      { KITTY_WINDOW_ID: '1' },
      false
    );

    await expect(
      launcher.open(request({ multiplexer: TerminalMultiplexer.Kitty }))
    ).rejects.toThrow(/allow_remote_control/);
  });

  it("uses the user's shell, or cmd.exe on Windows", () => {
    const exec = vi.fn();
    expect(
      new TerminalPaneLauncherService(exec, { SHELL: '/bin/zsh' }, false).defaultShell()
    ).toEqual(['/bin/zsh']);
    expect(new TerminalPaneLauncherService(exec, {}, false).defaultShell()).toEqual(['/bin/sh']);
    expect(
      new TerminalPaneLauncherService(
        exec,
        { ComSpec: 'C:\\Windows\\system32\\cmd.exe' },
        true
      ).defaultShell()
    ).toEqual(['C:\\Windows\\system32\\cmd.exe']);
    expect(new TerminalPaneLauncherService(exec, {}, true).defaultShell()).toEqual(['cmd.exe']);
  });

  it('returns the id the multiplexer printed for the new pane or window (spec 146)', async () => {
    const exec = vi.fn<ExecFunction>(async () => ({ stdout: '@12\n', stderr: '' }));
    const launcher = new TerminalPaneLauncherService(exec, { TMUX: 'x' }, false);

    expect(await launcher.open(request())).toEqual({ id: '@12' });
    exec.mockResolvedValue({ stdout: '', stderr: '' });
    expect(await launcher.open(request())).toEqual({});
  });

  it('renames a window, and does nothing where renaming is unsupported (spec 146)', async () => {
    const exec = vi.fn<ExecFunction>(async () => ({ stdout: '', stderr: '' }));
    const launcher = new TerminalPaneLauncherService(exec, { TMUX: 'x' }, false);

    await launcher.renameWindow(TerminalMultiplexer.Tmux, '@3', '◆ Billing');
    expect(exec).toHaveBeenCalledWith('tmux', ['rename-window', '-t', '@3', '◆ Billing'], {
      windowsHide: true,
    });
    await launcher.renameWindow(TerminalMultiplexer.Zellij, 'x', 'y');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('publishes status options, and reports a refusal (spec 146)', async () => {
    const exec = vi.fn<ExecFunction>(async () => ({ stdout: '', stderr: '' }));
    const launcher = new TerminalPaneLauncherService(exec, { TMUX: 'x' }, false);

    await launcher.publishStatus(TerminalMultiplexer.Tmux, { '@shep_needs_you': '1' });
    expect(exec.mock.calls[0][1]).toEqual(['set-option', '-g', '@shep_needs_you', '1']);

    exec.mockRejectedValue(Object.assign(new Error('x'), { stderr: "can't find window: @9" }));
    await expect(launcher.renameWindow(TerminalMultiplexer.Tmux, '@9', 'y')).rejects.toThrow(
      "tmux: can't find window: @9"
    );
  });
});
