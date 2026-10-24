/**
 * Multiplexer pane commands (spec 143).
 *
 * One pure builder per multiplexer turns a pane request into the exact argv
 * its CLI takes. Nothing here runs a process or builds a shell string, so a
 * branch name or a path can never become part of a command line.
 *
 * Sources: workmux (`src/multiplexer/*.rs`) and oh-my-pi
 * (`subprocess/terminal-launch`). See docs/competitors/agent-harness-tui.md.
 */

import { FeaturePanePlacement, TerminalMultiplexer } from '../../../domain/generated/output.js';
import type { TerminalPaneRequest } from '../../../application/ports/output/services/terminal-pane-launcher.interface.js';

export interface PaneCommandContext {
  request: TerminalPaneRequest;
  /** The caller's own pane (TMUX_PANE, WEZTERM_PANE), to split beside it. */
  paneId: string | undefined;
  /** The user's shell, for multiplexers that need a program to carry variables. */
  shell: readonly string[];
  isWindows: boolean;
}

export interface PaneInvocation {
  file: string;
  args: string[];
}

const END_OF_OPTIONS = '--';
const ENV_PROGRAM = 'env';

/** tmux format-expands -c, so a literal # must be doubled. */
function tmuxLiteral(text: string): string {
  return text.replaceAll('#', '##');
}

function assignments(environment: Readonly<Record<string, string>>): string[] {
  return Object.entries(environment).map(([name, value]) => `${name}=${value}`);
}

/**
 * The program a pane runs when the multiplexer cannot pass variables itself:
 * `env K=V <command or shell>` on POSIX. Windows has no `env`, so variables
 * are dropped there and the pane uses its own environment.
 */
function wrappedCommand(context: PaneCommandContext): string[] | undefined {
  const { command, environment } = context.request;
  const vars = context.isWindows ? [] : assignments(environment);
  if (vars.length === 0) return command ? [...command] : undefined;
  return [ENV_PROGRAM, ...vars, ...(command ?? context.shell)];
}

function afterOptions(command: readonly string[] | undefined): string[] {
  return command ? [END_OF_OPTIONS, ...command] : [];
}

function tmux(context: PaneCommandContext): PaneInvocation {
  const { request, paneId } = context;
  const detach = request.focus ? [] : ['-d'];
  const vars = assignments(request.environment).flatMap((a) => ['-e', a]);
  const where = ['-c', tmuxLiteral(request.cwd), ...vars];
  const args =
    request.placement === FeaturePanePlacement.Window
      ? ['new-window', ...detach, '-n', request.title, ...where, '-P', '-F', '#{window_id}']
      : [
          'split-window',
          '-h',
          ...detach,
          ...(paneId ? ['-t', paneId] : []),
          ...where,
          '-P',
          '-F',
          '#{pane_id}',
        ];
  return { file: 'tmux', args: [...args, ...afterOptions(request.command)] };
}

function zellij(context: PaneCommandContext): PaneInvocation {
  const { request } = context;
  const named = ['--cwd', request.cwd, '--name', request.title];
  const command = wrappedCommand(context);
  if (request.placement === FeaturePanePlacement.Window) {
    // `action new-tab` takes no command, so a window that runs one floats instead.
    return command
      ? { file: 'zellij', args: ['run', '--floating', ...named, ...afterOptions(command)] }
      : { file: 'zellij', args: ['action', 'new-tab', ...named] };
  }
  // A shell pane closes with the shell; a log pane stays to show how it ended.
  const closeOnExit = request.command ? [] : ['--close-on-exit'];
  return {
    file: 'zellij',
    args: [
      'run',
      '--direction',
      'right',
      ...closeOnExit,
      ...named,
      ...afterOptions(command ?? context.shell),
    ],
  };
}

function wezterm(context: PaneCommandContext): PaneInvocation {
  const { request, paneId } = context;
  const command = afterOptions(wrappedCommand(context));
  const args =
    request.placement === FeaturePanePlacement.Window
      ? ['cli', 'spawn', '--cwd', request.cwd]
      : [
          'cli',
          'split-pane',
          ...(paneId ? ['--pane-id', paneId] : []),
          '--right',
          '--cwd',
          request.cwd,
        ];
  return { file: 'wezterm', args: [...args, ...command] };
}

function kitty(context: PaneCommandContext): PaneInvocation {
  const { request } = context;
  const where =
    request.placement === FeaturePanePlacement.Window
      ? ['--type', 'tab']
      : ['--type', 'window', '--location', 'vsplit'];
  return {
    file: 'kitten',
    args: [
      '@',
      'launch',
      ...where,
      '--cwd',
      request.cwd,
      '--title',
      request.title,
      ...(request.focus ? [] : ['--keep-focus']),
      ...assignments(request.environment).flatMap((a) => ['--env', a]),
      ...(request.command ?? []),
    ],
  };
}

const BUILDERS: Record<TerminalMultiplexer, (context: PaneCommandContext) => PaneInvocation> = {
  [TerminalMultiplexer.Tmux]: tmux,
  [TerminalMultiplexer.Zellij]: zellij,
  [TerminalMultiplexer.WezTerm]: wezterm,
  [TerminalMultiplexer.Kitty]: kitty,
};

/** The command that opens this pane. */
export function buildPaneInvocation(context: PaneCommandContext): PaneInvocation {
  return BUILDERS[context.request.multiplexer](context);
}
