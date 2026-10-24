/**
 * In-memory pi-tui Terminal for unit tests (spec 142).
 *
 * Records every write and every call in order, and lets a test type keys and
 * resize the screen. No real TTY is touched.
 */

import type { Terminal } from '@mariozechner/pi-tui';

export class FakeTerminal implements Terminal {
  readonly calls: string[] = [];
  output = '';
  private onInput: ((data: string) => void) | undefined;
  private onResize: (() => void) | undefined;

  constructor(
    public columns = 100,
    public rows = 24
  ) {}

  readonly kittyProtocolActive = false;

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.calls.push('start');
    this.onInput = onInput;
    this.onResize = onResize;
  }

  stop(): void {
    this.calls.push('stop');
    this.onInput = undefined;
    this.onResize = undefined;
  }

  async drainInput(): Promise<void> {
    this.calls.push('drainInput');
  }

  write(data: string): void {
    this.calls.push(`write:${data}`);
    this.output += data;
  }

  /** Deliver input as if typed. */
  type(...keys: string[]): void {
    for (const key of keys) this.onInput?.(key);
  }

  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.onResize?.();
  }

  get started(): boolean {
    return this.onInput !== undefined;
  }

  moveBy(lines: number): void {
    this.calls.push(`moveBy:${lines}`);
  }
  hideCursor(): void {
    this.calls.push('hideCursor');
  }
  showCursor(): void {
    this.calls.push('showCursor');
  }
  clearLine(): void {
    this.calls.push('clearLine');
  }
  clearFromCursor(): void {
    this.calls.push('clearFromCursor');
  }
  clearScreen(): void {
    this.calls.push('clearScreen');
  }
  setTitle(title: string): void {
    this.calls.push(`setTitle:${title}`);
  }
  setProgress(active: boolean): void {
    this.calls.push(`setProgress:${active}`);
  }
}
