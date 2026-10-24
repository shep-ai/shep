/**
 * Full-screen pi-tui terminal (spec 142).
 *
 * pi-tui renders inline and keeps the terminal's scrollback. A dashboard
 * redrawn every two seconds belongs on the alternate screen instead, so this
 * decorator enters it before the wrapped terminal starts and leaves it after
 * the wrapped terminal stops — restoring the user's screen and scrollback
 * exactly as they were.
 */

import type { Terminal } from '@mariozechner/pi-tui';

const ENTER_ALTERNATE_SCREEN = '\x1b[?1049h';
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l';
const CLEAR_AND_HOME = '\x1b[2J\x1b[H';

export class FullscreenTerminal implements Terminal {
  private active = false;

  constructor(private readonly inner: Terminal) {}

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.inner.write(ENTER_ALTERNATE_SCREEN + CLEAR_AND_HOME);
    this.active = true;
    this.inner.start(onInput, onResize);
  }

  stop(): void {
    this.inner.stop();
    if (this.active) {
      this.inner.write(LEAVE_ALTERNATE_SCREEN);
      this.active = false;
    }
  }

  drainInput(maxMs?: number, idleMs?: number): Promise<void> {
    return this.inner.drainInput(maxMs, idleMs);
  }

  write(data: string): void {
    this.inner.write(data);
  }

  get columns(): number {
    return this.inner.columns;
  }

  get rows(): number {
    return this.inner.rows;
  }

  get kittyProtocolActive(): boolean {
    return this.inner.kittyProtocolActive;
  }

  moveBy(lines: number): void {
    this.inner.moveBy(lines);
  }

  hideCursor(): void {
    this.inner.hideCursor();
  }

  showCursor(): void {
    this.inner.showCursor();
  }

  clearLine(): void {
    this.inner.clearLine();
  }

  clearFromCursor(): void {
    this.inner.clearFromCursor();
  }

  clearScreen(): void {
    this.inner.clearScreen();
  }

  setTitle(title: string): void {
    this.inner.setTitle(title);
  }

  setProgress(active: boolean): void {
    this.inner.setProgress(active);
  }
}
