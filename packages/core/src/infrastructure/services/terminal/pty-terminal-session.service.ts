/**
 * PTY Terminal Session Service
 *
 * `node-pty`-backed implementation of `ITerminalSessionService`. Spawns a
 * real pseudo-terminal so interactive tools (vim, top, git, pnpm, etc.)
 * work exactly as they would in a native terminal. Cross-platform via
 * ConPTY on Windows and forkpty on Unix.
 */

import { injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, win32 } from 'node:path';
import type {
  CreatedTerminalSession,
  CreateTerminalSessionInput,
  ITerminalSessionService,
  TerminalExitListener,
  TerminalOutputListener,
} from '../../../application/ports/output/services/terminal-session-service.interface.js';
import { IS_WINDOWS } from '../../platform.js';
import { ensureSpawnHelperExecutable, explainSpawnError } from './pty-spawn-helper.js';
import { assertUsableCwd } from './terminal-cwd.js';
import { ConptyHostReaper, type SessionProcess } from './conpty-host-reaper.js';
import type * as NodePty from 'node-pty';

// node-pty is a native CJS module — keep it behind a lazy-resolved handle
// so unit tests that never touch terminals don't need to load the binary.
type PtyModule = typeof NodePty;
type IPty = NodePty.IPty;

interface SessionEntry {
  id: string;
  pty: IPty;
  shell: string;
  cwd: string;
  /** Ring buffer of recent output so late subscribers can be primed. */
  scrollback: string[];
  scrollbackBytes: number;
  dataListeners: Set<TerminalOutputListener>;
  exitListeners: Set<TerminalExitListener>;
  exited: boolean;
  exitCode: number | null;
  /** Resolves when the shell has exited (the pty's exit event fired). */
  exitPromise: Promise<void>;
  /**
   * Windows: the ConPTY host serving this shell, captured while it was alive
   * so close() can terminate exactly that process if it outlives the shell.
   */
  consoleHost: Promise<SessionProcess | null>;
}

const MAX_SCROLLBACK_BYTES = 256 * 1024; // 256 KB per session

/**
 * How long close() waits for the shell to exit after the pty is killed. The
 * exit event normally lands within a second; the ceiling only matters when
 * the pty never reports one, and the Windows reaper still runs after it.
 */
const SHELL_EXIT_TIMEOUT_MS = 5_000;

/** Delay before an exited session's entry is dropped, for late unsubscribes. */
const EXITED_SESSION_RETENTION_MS = 5_000;

const requireCjs = createRequire(import.meta.url);

@injectable()
export class PtyTerminalSessionService implements ITerminalSessionService {
  private readonly sessions = new Map<string, SessionEntry>();
  /** Teardowns in flight, so a repeated close() awaits the same one. */
  private readonly closing = new Map<string, Promise<void>>();
  private ptyModule: PtyModule | null = null;

  constructor(private readonly hostReaper: ConptyHostReaper = new ConptyHostReaper()) {}

  private loadPty(): PtyModule {
    if (this.ptyModule) return this.ptyModule;
    ensureSpawnHelperExecutable(dirname(requireCjs.resolve('node-pty/package.json')));
    // Dynamic CJS require so the native module is only loaded on demand.
    const mod = requireCjs('node-pty') as PtyModule;
    this.ptyModule = mod;
    return mod;
  }

  private resolveShell(): { shell: string; args: string[] } {
    if (IS_WINDOWS) {
      const shell = process.env.COMSPEC ?? 'powershell.exe';
      return { shell, args: [] };
    }
    const shell = process.env.SHELL ?? '/bin/bash';
    return { shell, args: [] };
  }

  create(input: CreateTerminalSessionInput): CreatedTerminalSession {
    const pty = this.loadPty();
    const { shell, args } = this.resolveShell();
    const cols = input.cols && input.cols > 0 ? input.cols : 80;
    const rows = input.rows && input.rows > 0 ? input.rows : 24;

    assertUsableCwd(input.cwd);

    let proc: NodePty.IPty;
    try {
      proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: input.cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1',
          ...(input.extraEnv ?? {}),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown spawn error';
      throw new Error(`Failed to spawn terminal: ${explainSpawnError(message)}`);
    }

    const id = randomUUID();
    let markExited!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      markExited = resolve;
    });
    const entry: SessionEntry = {
      id,
      pty: proc,
      shell,
      cwd: input.cwd,
      scrollback: [],
      scrollbackBytes: 0,
      dataListeners: new Set(),
      exitListeners: new Set(),
      exited: false,
      exitCode: null,
      exitPromise,
      // Must start now: the query needs the shell alive to find its host.
      consoleHost: IS_WINDOWS ? this.hostReaper.captureHost(proc.pid) : Promise.resolve(null),
    };
    this.sessions.set(id, entry);

    proc.onData((chunk) => {
      // Maintain bounded scrollback so reconnecting clients see recent state.
      entry.scrollback.push(chunk);
      entry.scrollbackBytes += chunk.length;
      while (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES && entry.scrollback.length > 0) {
        const dropped = entry.scrollback.shift();
        if (dropped) entry.scrollbackBytes -= dropped.length;
      }
      for (const listener of entry.dataListeners) {
        try {
          listener(chunk);
        } catch {
          // Ignore listener errors so one bad subscriber can't poison others.
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      entry.exited = true;
      entry.exitCode = exitCode;
      markExited();
      // A shell that exits on its own (`exit`) can leave its host behind too.
      if (!this.closing.has(id)) {
        void entry.consoleHost.then((host) => this.reapWindowsSession(entry, host));
      }
      for (const listener of entry.exitListeners) {
        try {
          listener(exitCode);
        } catch {
          // ignore
        }
      }
      // Keep entry briefly so late SSE unsubscribes still work, then drop.
      setTimeout(() => {
        this.sessions.delete(id);
      }, EXITED_SESSION_RETENTION_MS).unref();
    });

    return { id, shell, cwd: input.cwd };
  }

  write(sessionId: string, data: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    entry.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    if (cols > 0 && rows > 0) {
      try {
        entry.pty.resize(cols, rows);
      } catch {
        // resize can throw if the child already exited — swallow
      }
    }
  }

  subscribe(
    sessionId: string,
    onData: TerminalOutputListener,
    onExit?: TerminalExitListener
  ): () => void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return () => {
        /* no-op for missing session */
      };
    }

    // Prime new subscriber with scrollback so reconnects see history.
    if (entry.scrollback.length > 0) {
      try {
        onData(entry.scrollback.join(''));
      } catch {
        // ignore
      }
    }

    entry.dataListeners.add(onData);
    if (onExit) entry.exitListeners.add(onExit);

    // If the session already exited, fire exit listener on next tick.
    if (entry.exited && onExit) {
      const code = entry.exitCode;
      setImmediate(() => {
        try {
          onExit(code);
        } catch {
          // ignore
        }
      });
    }

    return () => {
      entry.dataListeners.delete(onData);
      if (onExit) entry.exitListeners.delete(onExit);
    };
  }

  exists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  close(sessionId: string): Promise<void> {
    const pending = this.closing.get(sessionId);
    if (pending) return pending;
    const entry = this.sessions.get(sessionId);
    if (!entry) return Promise.resolve();
    this.sessions.delete(sessionId);
    const teardown = this.teardown(entry).finally(() => this.closing.delete(sessionId));
    this.closing.set(sessionId, teardown);
    return teardown;
  }

  /**
   * Kill the pty and wait until its processes are actually gone.
   *
   * `pty.kill()` only signals: the shell exits asynchronously and keeps its
   * cwd locked until it does (EBUSY on Windows). On Windows the ConPTY host
   * is a separate child of ours that can outlive the shell (#927), so after
   * the exit event both are terminated by their captured PIDs if still alive.
   */
  private async teardown(entry: SessionEntry): Promise<void> {
    // The host must be captured before the kill: the query reads it from
    // the live shell. It normally finished long before the user closes.
    const consoleHost = await entry.consoleHost;
    try {
      entry.pty.kill();
    } catch {
      // Already exited.
    }
    await this.waitForExit(entry);
    await this.reapWindowsSession(entry, consoleHost);
  }

  /** Windows: terminate the shell and its ConPTY host if either survived. */
  private async reapWindowsSession(
    entry: SessionEntry,
    consoleHost: SessionProcess | null
  ): Promise<void> {
    if (!IS_WINDOWS) return;
    const processes: SessionProcess[] = [
      { pid: entry.pty.pid, image: win32.basename(entry.shell) },
    ];
    if (consoleHost) processes.push(consoleHost);
    await this.hostReaper.reap(processes);
  }

  private waitForExit(entry: SessionEntry): Promise<void> {
    if (entry.exited) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SHELL_EXIT_TIMEOUT_MS);
      timer.unref();
      void entry.exitPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
