/**
 * Multiplexer pane commands Unit Tests (spec 143)
 *
 * Every multiplexer gets an exact argv array: no shell string is ever built,
 * so a branch name or path cannot become a command.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { FeaturePanePlacement, TerminalMultiplexer } from '@/domain/generated/output.js';
import type { TerminalPaneRequest } from '@/application/ports/output/services/terminal-pane-launcher.interface.js';
import {
  buildPaneInvocation,
  type PaneCommandContext,
} from '@/infrastructure/services/terminal-pane/multiplexer-commands.js';

const LOG = ['/usr/bin/node', '/opt/shep/cli.js', 'feat', 'logs', '-f', 'abc12345'];

function context(
  multiplexer: TerminalMultiplexer,
  overrides: Partial<TerminalPaneRequest> = {},
  extra: Partial<PaneCommandContext> = {}
): PaneCommandContext {
  return {
    request: {
      multiplexer,
      placement: FeaturePanePlacement.Split,
      cwd: '/work/wt/feat-login',
      title: 'shep abc12345',
      environment: {},
      focus: true,
      ...overrides,
    },
    paneId: undefined,
    shell: ['/bin/zsh'],
    isWindows: false,
    ...extra,
  };
}

describe('buildPaneInvocation', () => {
  describe('tmux', () => {
    it('splits beside the calling pane with the shell, printing the new pane id', () => {
      expect(buildPaneInvocation(context(TerminalMultiplexer.Tmux, {}, { paneId: '%3' }))).toEqual({
        file: 'tmux',
        args: [
          'split-window',
          '-h',
          '-t',
          '%3',
          '-c',
          '/work/wt/feat-login',
          '-P',
          '-F',
          '#{pane_id}',
        ],
      });
    });

    it('runs a command after --, passes variables with -e, and keeps focus with -d', () => {
      const invocation = buildPaneInvocation(
        context(TerminalMultiplexer.Tmux, {
          command: LOG,
          focus: false,
          environment: { SHEP_HOME: '/home/u/.shep-test' },
        })
      );
      expect(invocation.args).toEqual([
        'split-window',
        '-h',
        '-d',
        '-c',
        '/work/wt/feat-login',
        '-e',
        'SHEP_HOME=/home/u/.shep-test',
        '-P',
        '-F',
        '#{pane_id}',
        '--',
        ...LOG,
      ]);
    });

    it('doubles # in the directory, which tmux would format-expand', () => {
      const { args } = buildPaneInvocation(
        context(TerminalMultiplexer.Tmux, { cwd: '/work/#42-fix' })
      );
      expect(args[args.indexOf('-c') + 1]).toBe('/work/##42-fix');
    });

    it('opens a named window', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Tmux, { placement: FeaturePanePlacement.Window })
        ).args
      ).toEqual([
        'new-window',
        '-n',
        'shep abc12345',
        '-c',
        '/work/wt/feat-login',
        '-P',
        '-F',
        '#{window_id}',
      ]);
    });
  });

  describe('Zellij', () => {
    it('runs the shell in a pane to the right that closes when it exits', () => {
      expect(buildPaneInvocation(context(TerminalMultiplexer.Zellij))).toEqual({
        file: 'zellij',
        args: [
          'run',
          '--direction',
          'right',
          '--close-on-exit',
          '--cwd',
          '/work/wt/feat-login',
          '--name',
          'shep abc12345',
          '--',
          '/bin/zsh',
        ],
      });
    });

    it('keeps a command pane open after it exits and carries variables with env', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Zellij, {
            command: LOG,
            environment: { SHEP_HOME: '/h' },
          })
        ).args
      ).toEqual([
        'run',
        '--direction',
        'right',
        '--cwd',
        '/work/wt/feat-login',
        '--name',
        'shep abc12345',
        '--',
        'env',
        'SHEP_HOME=/h',
        ...LOG,
      ]);
    });

    it('opens a shell window as a new tab', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Zellij, { placement: FeaturePanePlacement.Window })
        ).args
      ).toEqual(['action', 'new-tab', '--cwd', '/work/wt/feat-login', '--name', 'shep abc12345']);
    });

    it('opens a window with a command as a floating pane (new-tab takes no command)', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Zellij, {
            placement: FeaturePanePlacement.Window,
            command: LOG,
          })
        ).args
      ).toEqual([
        'run',
        '--floating',
        '--cwd',
        '/work/wt/feat-login',
        '--name',
        'shep abc12345',
        '--',
        ...LOG,
      ]);
    });
  });

  describe('WezTerm', () => {
    it('splits the calling pane to the right', () => {
      expect(
        buildPaneInvocation(context(TerminalMultiplexer.WezTerm, {}, { paneId: '7' }))
      ).toEqual({
        file: 'wezterm',
        args: ['cli', 'split-pane', '--pane-id', '7', '--right', '--cwd', '/work/wt/feat-login'],
      });
    });

    it('runs a command after --, and the shell when only variables must be carried', () => {
      expect(
        buildPaneInvocation(context(TerminalMultiplexer.WezTerm, { command: LOG })).args
      ).toEqual(['cli', 'split-pane', '--right', '--cwd', '/work/wt/feat-login', '--', ...LOG]);
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.WezTerm, { environment: { SHEP_HOME: '/h' } })
        ).args
      ).toEqual([
        'cli',
        'split-pane',
        '--right',
        '--cwd',
        '/work/wt/feat-login',
        '--',
        'env',
        'SHEP_HOME=/h',
        '/bin/zsh',
      ]);
    });

    it('spawns a tab for a window', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.WezTerm, {
            placement: FeaturePanePlacement.Window,
            command: LOG,
          })
        ).args
      ).toEqual(['cli', 'spawn', '--cwd', '/work/wt/feat-login', '--', ...LOG]);
    });

    it('drops the env prefix on Windows, which has no env program', () => {
      expect(
        buildPaneInvocation(
          context(
            TerminalMultiplexer.WezTerm,
            { command: LOG, environment: { SHEP_HOME: 'C:\\h' } },
            { isWindows: true }
          )
        ).args
      ).toEqual(['cli', 'split-pane', '--right', '--cwd', '/work/wt/feat-login', '--', ...LOG]);
    });
  });

  describe('kitty', () => {
    it('launches a vertical split window with variables and a title', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Kitty, {
            command: LOG,
            focus: false,
            environment: { SHEP_HOME: '/h' },
          })
        )
      ).toEqual({
        file: 'kitten',
        args: [
          '@',
          'launch',
          '--type',
          'window',
          '--location',
          'vsplit',
          '--cwd',
          '/work/wt/feat-login',
          '--title',
          'shep abc12345',
          '--keep-focus',
          '--env',
          'SHEP_HOME=/h',
          ...LOG,
        ],
      });
    });

    it('launches a tab with the shell for a window', () => {
      expect(
        buildPaneInvocation(
          context(TerminalMultiplexer.Kitty, { placement: FeaturePanePlacement.Window })
        ).args
      ).toEqual([
        '@',
        'launch',
        '--type',
        'tab',
        '--cwd',
        '/work/wt/feat-login',
        '--title',
        'shep abc12345',
      ]);
    });
  });
});
