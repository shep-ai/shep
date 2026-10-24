/**
 * Terminal pane launcher (specs 143, 146).
 *
 * Implements ITerminalPaneLauncher: detects the multiplexer from the process
 * environment, runs the argv `multiplexer-commands.ts` builds through the
 * shared ExecFunction (argv only, Windows shims resolved), and turns a refusal
 * into one line the console can show.
 */

import { TerminalMultiplexer } from '../../../domain/generated/output.js';
import {
  detectTerminalMultiplexer,
  type EnvironmentRecord,
} from '../../../domain/shared/terminal-multiplexer.js';
import type {
  ITerminalPaneLauncher,
  OpenedPane,
  TerminalPaneRequest,
} from '../../../application/ports/output/services/terminal-pane-launcher.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';
import {
  buildPaneInvocation,
  buildRenameInvocation,
  buildStatusInvocation,
  type PaneInvocation,
} from './multiplexer-commands.js';

const POSIX_FALLBACK_SHELL = '/bin/sh';
const WINDOWS_FALLBACK_SHELL = 'cmd.exe';
const NOT_FOUND = 'ENOENT';
const KITTY_FILE = 'kitten';
const KITTY_HINT =
  'kitty needs remote control: set allow_remote_control yes and listen_on in kitty.conf';

/** The calling pane's id, per multiplexer that can split beside a given pane. */
const PANE_ID_VARIABLE: Partial<Record<TerminalMultiplexer, string>> = {
  [TerminalMultiplexer.Tmux]: 'TMUX_PANE',
  [TerminalMultiplexer.WezTerm]: 'WEZTERM_PANE',
};

export class TerminalPaneLauncherService implements ITerminalPaneLauncher {
  constructor(
    private readonly exec: ExecFunction,
    private readonly env: EnvironmentRecord,
    private readonly isWindows: boolean
  ) {}

  detect(): TerminalMultiplexer | undefined {
    return detectTerminalMultiplexer(this.env);
  }

  async open(request: TerminalPaneRequest): Promise<OpenedPane> {
    const variable = PANE_ID_VARIABLE[request.multiplexer];
    const invocation = buildPaneInvocation({
      request,
      paneId: variable ? nonEmpty(this.env[variable]) : undefined,
      shell: this.defaultShell(),
      isWindows: this.isWindows,
    });
    const stdout = await this.run(invocation, request.cwd);
    const id = nonEmpty(stdout.split(/\r?\n/)[0]?.trim());
    return id ? { id } : {};
  }

  async renameWindow(multiplexer: TerminalMultiplexer, id: string, title: string): Promise<void> {
    const invocation = buildRenameInvocation(multiplexer, id, title);
    if (invocation) await this.run(invocation);
  }

  async publishStatus(
    multiplexer: TerminalMultiplexer,
    values: Readonly<Record<string, string>>
  ): Promise<void> {
    const invocation = buildStatusInvocation(multiplexer, values);
    if (invocation) await this.run(invocation);
  }

  private async run({ file, args }: PaneInvocation, cwd?: string): Promise<string> {
    try {
      const { stdout } = await this.exec(file, args, {
        ...(cwd !== undefined && { cwd }),
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      throw new Error(describeFailure(file, error));
    }
  }

  defaultShell(): string[] {
    if (this.isWindows) return [nonEmpty(this.env.ComSpec) ?? WINDOWS_FALLBACK_SHELL];
    return [nonEmpty(this.env.SHELL) ?? POSIX_FALLBACK_SHELL];
  }
}

/** An unset and an empty variable mean the same thing. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function describeFailure(file: string, error: unknown): string {
  const failure = error as { code?: unknown; stderr?: unknown; message?: unknown };
  if (failure.code === NOT_FOUND) return `${file} is not on the PATH`;
  const stderr = typeof failure.stderr === 'string' ? failure.stderr.trim() : '';
  const detail =
    nonEmpty(stderr) ?? (typeof failure.message === 'string' ? failure.message : String(error));
  const message = `${file}: ${detail}`;
  return file === KITTY_FILE ? `${message} (${KITTY_HINT})` : message;
}
