/**
 * Real-terminal harness for TUI e2e tests (spec 142).
 *
 * Spawns a process in a pseudo-terminal (node-pty) and feeds everything it
 * writes into a headless xterm, so a test reads the SCREEN a user would see —
 * after cursor moves, differential repaints and alternate-screen switches —
 * instead of an unreadable byte stream.
 *
 * Waits are condition-based with a deadline; there are no fixed sleeps.
 */

import { createRequire } from 'node:module';
import * as pty from 'node-pty';
import type { Terminal as HeadlessTerminal } from '@xterm/headless';

// The package's ESM entry is not shipped; load its CommonJS build.
const { Terminal } = createRequire(import.meta.url)('@xterm/headless') as {
  Terminal: typeof HeadlessTerminal;
};

export interface PtyScreenOptions {
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface PtyExit {
  exitCode: number;
  signal?: number;
}

const POLL_INTERVAL_MS = 50;

export class PtyScreen {
  readonly exited: Promise<PtyExit>;
  /** Everything the process wrote, for diagnostics and evidence. */
  raw = '';
  private readonly term: HeadlessTerminal;
  private readonly proc: pty.IPty;
  private exit: PtyExit | undefined;

  private constructor(file: string, args: string[], options: PtyScreenOptions) {
    this.term = new Terminal({ cols: options.cols, rows: options.rows, allowProposedApi: true });
    this.proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: Object.fromEntries(
        Object.entries(options.env).filter((e): e is [string, string] => e[1] !== undefined)
      ),
    });
    this.proc.onData((data) => {
      this.raw += data;
      this.term.write(data);
    });
    this.exited = new Promise((resolve) => {
      this.proc.onExit((e) => {
        this.exit = { exitCode: e.exitCode, signal: e.signal };
        resolve(this.exit);
      });
    });
  }

  static spawn(file: string, args: string[], options: PtyScreenOptions): PtyScreen {
    return new PtyScreen(file, args, options);
  }

  /** The visible screen, one string per row, trailing spaces trimmed. */
  lines(): string[] {
    const buffer = this.term.buffer.active;
    return Array.from(
      { length: this.term.rows },
      (_, y) => buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? ''
    );
  }

  text(): string {
    return this.lines().join('\n');
  }

  /** True while the application is on the alternate screen. */
  get onAlternateScreen(): boolean {
    return this.term.buffer.active.type === 'alternate';
  }

  get hasExited(): boolean {
    return this.exit !== undefined;
  }

  press(data: string): void {
    this.proc.write(data);
  }

  /** Wait until the screen satisfies `predicate`; the error shows the last screen. */
  async waitFor(
    predicate: (screen: string) => boolean,
    description: string,
    timeoutMs: number
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    // Let pending writes reach the emulator before each check.
    const flush = () => new Promise<void>((resolve) => this.term.write('', resolve));
    for (;;) {
      await flush();
      if (predicate(this.text())) return;
      if (this.exit) {
        throw new Error(
          `Process exited (${this.exit.exitCode}) before: ${description}\n--- screen ---\n${this.text()}`
        );
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for: ${description}\n--- screen ---\n${this.text()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  waitForText(text: string, timeoutMs: number): Promise<void> {
    return this.waitFor((screen) => screen.includes(text), `"${text}" on screen`, timeoutMs);
  }

  kill(): void {
    if (!this.exit) this.proc.kill();
  }
}
