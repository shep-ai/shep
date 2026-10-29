/**
 * Learned-harness decisions view (spec 150, task-23).
 *
 * The harness changes waiting for the user, one selected at a time with its
 * summary and the diff preview core rendered: `a` adopts it, `r` rejects it
 * with optional feedback typed on the status line. Answers are intents; the
 * app sends them through the inbox.
 */

import type { TFunction } from 'i18next';
import { Input, matchesKey, wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { ConsoleKey, resolveConsoleKey } from './console-keys.js';
import { fit, paint, sanitizeText, stripStyles } from './console-format.js';
import { NS, SEPARATOR } from './console-labels.js';
import { padTo } from './console-layout.js';
import type { ConsoleOverlay, OverlayPrompt } from './console-overlay.js';
import type { HarnessDecisionItem } from './harness-decisions.js';

export interface HarnessDecisionsIntents {
  adopt(item: HarnessDecisionItem): void;
  reject(item: HarnessDecisionItem, feedback: string | undefined): void;
  close(): void;
  quit(): void;
}

/** Decisions listed above the selected one's details. */
const LIST_LINES = 4;

/** How a preview line looks, by the marker core puts first. */
const PREVIEW_MARKS: readonly [string, (text: string) => string][] = [
  ['+ ', paint.ok],
  ['~ ', paint.attention],
  ['- ', paint.error],
  ['! ', paint.error],
];

export class HarnessDecisionsView implements ConsoleOverlay {
  private readonly feedback = new Input();
  private items: HarnessDecisionItem[] = [];
  private index = 0;
  private rejecting = false;

  constructor(
    private readonly t: TFunction,
    private readonly intents: HarnessDecisionsIntents
  ) {}

  /** How many decisions wait. */
  get count(): number {
    return this.items.length;
  }

  open(): void {
    this.index = 0;
    this.closeFeedback();
  }

  /** The current list; the selection stays on the same decision when it is still there. */
  setItems(items: readonly HarnessDecisionItem[]): void {
    const current = this.selected?.questionId;
    this.items = [...items];
    const kept = this.items.findIndex((i) => i.questionId === current);
    this.index = kept >= 0 ? kept : Math.min(this.index, Math.max(0, this.items.length - 1));
    if (!this.selected) this.closeFeedback();
  }

  get prompt(): OverlayPrompt | undefined {
    return this.rejecting
      ? { label: this.t(`${NS}.harness.rejectPrompt`), input: this.feedback }
      : undefined;
  }

  get hint(): string {
    return this.t(`${NS}.harness.${this.rejecting ? 'rejectHint' : 'hint'}`);
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'ctrl+c')) return this.intents.quit();
    if (this.rejecting) return this.handleFeedback(data);
    const item = this.selected;
    switch (resolveConsoleKey(data)) {
      case ConsoleKey.Up:
        return this.move(-1);
      case ConsoleKey.Down:
        return this.move(1);
      case ConsoleKey.Approve:
        if (item) this.intents.adopt(item);
        return;
      case ConsoleKey.Reject:
        if (!item) return;
        this.rejecting = true;
        this.feedback.setValue('');
        this.feedback.focused = true;
        return;
      case ConsoleKey.Escape:
        return this.intents.close();
      case ConsoleKey.Quit:
        return this.intents.quit();
      default:
        return;
    }
  }

  render(width: number, height: number): string[] {
    const { t } = this;
    const title = `${paint.title(t(`${NS}.harness.title`))}${paint.muted(
      `${SEPARATOR}${t(`${NS}.harness.waiting`, { count: this.items.length })}`
    )}`;
    const item = this.selected;
    if (!item) {
      return padTo([title, '', paint.muted(`  ${t(`${NS}.harness.empty`)}`)], height).map((l) =>
        fit(l, width)
      );
    }
    const lines = [
      title,
      ...this.renderList(width),
      '',
      ...wrap(paint.heading(sanitizeText(item.summary)), width),
      '',
      ...sanitizeText(item.preview)
        .split(/\r?\n/)
        .flatMap((line) => wrap(styleOfPreview(line)(line), width)),
    ];
    return padTo(lines, height).map((l) => fit(l, width));
  }

  private get selected(): HarnessDecisionItem | undefined {
    return this.items[this.index];
  }

  private renderList(width: number): string[] {
    const start = Math.max(
      0,
      Math.min(this.index - LIST_LINES + 1, this.items.length - LIST_LINES)
    );
    return this.items.slice(start, start + LIST_LINES).map((item, i) => {
      const firstLine = sanitizeText(item.summary).split(/\r?\n/)[0];
      const text = fit(`  ${start + i + 1}. ${firstLine}`, width);
      return start + i === this.index ? paint.selected(stripStyles(text)) : paint.muted(text);
    });
  }

  private handleFeedback(data: string): void {
    if (matchesKey(data, 'escape')) return this.closeFeedback();
    if (!matchesKey(data, 'enter')) return this.feedback.handleInput(data);
    const item = this.selected;
    const feedback = this.feedback.getValue().trim();
    this.closeFeedback();
    if (item) this.intents.reject(item, feedback || undefined);
  }

  private closeFeedback(): void {
    this.rejecting = false;
    this.feedback.focused = false;
    this.feedback.setValue('');
  }

  private move(delta: number): void {
    this.index = Math.min(Math.max(0, this.index + delta), Math.max(0, this.items.length - 1));
  }
}

function styleOfPreview(line: string): (text: string) => string {
  return PREVIEW_MARKS.find(([mark]) => line.startsWith(mark))?.[1] ?? ((text) => text);
}

function wrap(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
