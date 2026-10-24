/**
 * A private tmux server for e2e tests (specs 143, 146).
 *
 * Runs on its own socket (`tmux -L`), so a test never touches a developer's
 * sessions, and answers questions about panes and windows from tmux itself
 * instead of parsing the screen.
 */

import { spawnSync } from 'node:child_process';

/** tmux rewrites control characters in -F output, so fields are split on a printable marker. */
const FIELD = ' ::: ';
const POLL_MS = 100;
const DEFAULT_COLS = 200;
const DEFAULT_ROWS = 45;

export interface TmuxPane {
  id: string;
  active: boolean;
  path: string;
  start: string;
}

export interface TmuxWindow {
  id: string;
  name: string;
}

export function hasTmux(): boolean {
  return process.platform !== 'win32' && spawnSync('tmux', ['-V'], { stdio: 'pipe' }).status === 0;
}

export class TmuxServer {
  constructor(readonly socket: string) {}

  run(...args: string[]): string {
    // -u: a client without a UTF-8 locale prints ◆ and · as _ when it reads names and options.
    const result = spawnSync('tmux', ['-u', '-L', this.socket, ...args], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`tmux ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  }

  panes(target: string): TmuxPane[] {
    return this.rows('list-panes', target, [
      '#{pane_id}',
      '#{pane_active}',
      '#{pane_current_path}',
      '#{pane_start_command}',
    ]).map(([id, active, path, ...start]) => ({
      id,
      active: active === '1',
      path,
      start: start.join(FIELD),
    }));
  }

  windows(session: string): TmuxWindow[] {
    return this.rows('list-windows', session, ['#{window_id}', '#{window_name}']).map(
      ([id, ...name]) => ({ id, name: name.join(FIELD) })
    );
  }

  /** A detached session whose only pane runs `command` with these variables set. */
  startSession(
    session: string,
    options: {
      cwd: string;
      env: Record<string, string>;
      command: string[];
      cols?: number;
      rows?: number;
    }
  ): void {
    this.run(
      'new-session',
      '-d',
      '-s',
      session,
      '-x',
      String(options.cols ?? DEFAULT_COLS),
      '-y',
      String(options.rows ?? DEFAULT_ROWS),
      '-c',
      options.cwd,
      ...Object.entries(options.env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
      '--',
      ...options.command
    );
  }

  capture(paneId: string): string {
    return this.run('capture-pane', '-p', '-t', paneId);
  }

  /** A global option's value, or '' when unset. */
  option(name: string): string {
    return this.run('show-options', '-gqv', name).trim();
  }

  kill(): void {
    spawnSync('tmux', ['-L', this.socket, 'kill-server'], { stdio: 'pipe' });
  }

  private rows(command: string, target: string, fields: string[]): string[][] {
    return this.run(command, '-t', target, '-F', fields.join(FIELD))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(FIELD));
  }
}

/** Poll until `read` returns a value, or fail with what tmux shows. */
export async function waitForTmux<T>(
  read: () => T | undefined,
  description: string,
  timeoutMs: number,
  diagnostics: () => string = () => ''
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for: ${description}\n${diagnostics()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
