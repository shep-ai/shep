/**
 * Terminal Session Service
 *
 * Output port for long-lived interactive terminal (PTY) sessions owned by
 * the infrastructure layer. Presentation layers (web, TUI, CLI) stream
 * output from the session and feed input into it through this generic API
 * so no provider-specific terminal code leaks outside of infrastructure.
 */

export interface CreateTerminalSessionInput {
  /** Absolute working directory to spawn the PTY in. */
  cwd: string;
  /** Initial terminal size in columns. */
  cols?: number;
  /** Initial terminal size in rows. */
  rows?: number;
}

export interface CreatedTerminalSession {
  /** Opaque session id used for all subsequent operations. */
  id: string;
  /** Shell binary actually spawned (e.g. `/bin/bash`, `powershell.exe`). */
  shell: string;
  /** Resolved cwd the session is running in. */
  cwd: string;
}

export type TerminalOutputListener = (chunk: string) => void;
export type TerminalExitListener = (code: number | null) => void;

export interface ITerminalSessionService {
  /** Create a new PTY session. */
  create(input: CreateTerminalSessionInput): CreatedTerminalSession;

  /** Write stdin data to a session. */
  write(sessionId: string, data: string): void;

  /** Resize a session's pseudo-terminal. */
  resize(sessionId: string, cols: number, rows: number): void;

  /**
   * Subscribe to a session's output stream.
   *
   * Returns an unsubscribe function. Safe to subscribe multiple times (e.g.
   * for SSE reconnects) — each subscriber gets independent callbacks.
   */
  subscribe(
    sessionId: string,
    onData: TerminalOutputListener,
    onExit?: TerminalExitListener
  ): () => void;

  /** Whether a session id currently exists. */
  exists(sessionId: string): boolean;

  /** Kill and remove a session. Idempotent. */
  close(sessionId: string): void;
}
