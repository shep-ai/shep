/**
 * Feature console prompts (specs 142, 143): the reject-feedback line and the
 * roster filter line. Each is a pi-tui Input drawn on the status line; this
 * owns their wiring so the view only switches modes.
 */

import { Input } from '@mariozechner/pi-tui';
import { ConsoleMode } from './console-screen.js';

export interface PromptHandlers {
  /** Enter on non-empty feedback. */
  submitReject(feedback: string): void;
  /** The filter text changed (typed, or cleared by esc). */
  filterChanged(): void;
  /** A prompt closed; the view returns to browsing. */
  closed(): void;
}

export class ConsolePrompts {
  readonly feedback = new Input();
  readonly filter = new Input();

  constructor(private readonly handlers: PromptHandlers) {
    this.feedback.onSubmit = (value) => {
      const feedback = value.trim();
      if (!feedback) return;
      this.close();
      handlers.submitReject(feedback);
    };
    this.feedback.onEscape = () => this.close();
    this.filter.onSubmit = () => this.close();
    this.filter.onEscape = () => {
      this.filter.setValue('');
      handlers.filterChanged();
      this.close();
    };
  }

  get query(): string {
    return this.filter.getValue();
  }

  openReject(): void {
    this.feedback.setValue('');
    this.feedback.focused = true;
  }

  openFilter(): void {
    this.filter.focused = true;
  }

  clearFilter(): void {
    this.filter.setValue('');
    this.handlers.filterChanged();
  }

  /** Feed input to the prompt of this mode; false when the mode has none. */
  handle(mode: ConsoleMode, data: string): boolean {
    const input =
      mode === ConsoleMode.Reject
        ? this.feedback
        : mode === ConsoleMode.Filter
          ? this.filter
          : undefined;
    if (!input) return false;
    input.handleInput(data);
    if (input === this.filter) this.handlers.filterChanged();
    return true;
  }

  private close(): void {
    this.feedback.focused = false;
    this.filter.focused = false;
    this.handlers.closed();
  }
}
