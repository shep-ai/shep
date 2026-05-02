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
import type {
  CreatedTerminalSession,
  CreateTerminalSessionInput,
  ITerminalSessionService,
  TerminalExitListener,
  TerminalOutputListener,
} from '../../../application/ports/output/services/terminal-session-service.interface.js';
import { IS_WINDOWS } from '../../platform.js';
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
}

const MAX_SCROLLBACK_BYTES = 256 * 1024; // 256 KB per session

const requireCjs = createRequire(import.meta.url);

@injectable()
export class PtyTerminalSessionService implements ITerminalSessionService {
  private readonly sessions = new Map<string, SessionEntry>();
  private ptyModule: PtyModule | null = null;

  private loadPty(): PtyModule {
    if (this.ptyModule) return this.ptyModule;
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

    const proc = pty.spawn(shell, args, {
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

    const id = randomUUID();
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
      }, 5_000);
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

  close(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      entry.pty.kill();
    } catch {
      // ignore
    }
    this.sessions.delete(sessionId);
  }
}
