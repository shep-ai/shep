/**
 * A console overlay (specs 147, 150): a view that takes the console's body
 * while it is open — the chat, the learned-harness decisions, the create
 * form. It owns its keys; the console draws its body, its status-line prompt
 * and its hint, and gives the screen back when it closes.
 */

import type { Input } from '@mariozechner/pi-tui';

export interface OverlayPrompt {
  label: string;
  input: Input;
}

export interface ConsoleOverlay {
  /** The line being typed, drawn on the status line; undefined while there is none. */
  readonly prompt: OverlayPrompt | undefined;
  /** The key hint drawn on the bottom line. */
  readonly hint: string;
  handleInput(data: string): void;
  /** Exactly `height` lines. */
  render(width: number, height: number): string[];
}
