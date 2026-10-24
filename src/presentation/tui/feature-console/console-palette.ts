/**
 * Command palette (spec 145).
 *
 * Every console command, filterable by name, with its key shown for next
 * time. An entry stands for a ConsoleKey: running it replays that key through
 * the view, so the palette can never do what the key itself would refuse.
 */

import type { TFunction } from 'i18next';
import { Input, fuzzyFilter, matchesKey } from '@mariozechner/pi-tui';
import { FeatureConsoleAction } from '@/domain/generated/output.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import { ConsoleKey } from './console-keys.js';
import { fit, fitRight, paint, stripStyles } from './console-format.js';
import { NS } from './console-labels.js';

export interface PaletteContext {
  row: FeatureConsoleRow | undefined;
  filterActive: boolean;
}

export interface PaletteEntry {
  key: ConsoleKey;
  /** The key that runs it directly, shown beside the label. */
  chord: string;
  label: string;
}

/** What the view should do after a key in the palette. */
export interface PaletteResult {
  run?: ConsoleKey;
  close?: boolean;
}

type Availability = (context: PaletteContext) => boolean;

const always: Availability = () => true;
const hasRow: Availability = ({ row }) => row !== undefined;
const hasRun: Availability = ({ row }) => Boolean(row?.runId);
const offers =
  (action: FeatureConsoleAction): Availability =>
  ({ row }) =>
    row?.actions.includes(action) ?? false;

/** Palette order: what the user most likely came for first. */
const COMMANDS: readonly { key: ConsoleKey; chord: string; when: Availability }[] = [
  { key: ConsoleKey.Approve, chord: 'a', when: offers(FeatureConsoleAction.Approve) },
  { key: ConsoleKey.Reject, chord: 'r', when: offers(FeatureConsoleAction.Reject) },
  { key: ConsoleKey.Stop, chord: 's', when: offers(FeatureConsoleAction.Stop) },
  { key: ConsoleKey.Resume, chord: 'R', when: offers(FeatureConsoleAction.Resume) },
  { key: ConsoleKey.Shell, chord: 't', when: hasRow },
  { key: ConsoleKey.ShellWindow, chord: 'T', when: hasRow },
  { key: ConsoleKey.FollowLog, chord: 'f', when: hasRun },
  { key: ConsoleKey.FollowLogWindow, chord: 'F', when: hasRun },
  { key: ConsoleKey.Details, chord: 'enter', when: hasRow },
  { key: ConsoleKey.Log, chord: 'l', when: hasRow },
  { key: ConsoleKey.CopyId, chord: 'c', when: hasRow },
  { key: ConsoleKey.Filter, chord: '/', when: always },
  { key: ConsoleKey.ClearFilter, chord: '', when: ({ filterActive }) => filterActive },
  { key: ConsoleKey.Help, chord: '?', when: always },
  { key: ConsoleKey.Quit, chord: 'q', when: always },
];

/** The commands that apply right now, labelled. */
export function paletteEntries(context: PaletteContext, t: TFunction): PaletteEntry[] {
  return COMMANDS.filter((c) => c.when(context)).map((c) => ({
    key: c.key,
    chord: c.chord,
    label: t(`${NS}.palette.commands.${c.key}`),
  }));
}

export class CommandPalette {
  private entries: PaletteEntry[] = [];
  private shown: PaletteEntry[] = [];
  private index = 0;
  /** The query being typed; the status line draws it. */
  readonly input = new Input();

  get visible(): readonly PaletteEntry[] {
    return this.shown;
  }

  open(entries: PaletteEntry[]): void {
    this.entries = entries;
    this.input.setValue('');
    this.input.focused = true;
    this.update();
  }

  close(): void {
    this.input.focused = false;
  }

  handleInput(data: string): PaletteResult {
    if (matchesKey(data, 'escape')) return { close: true };
    if (matchesKey(data, 'enter')) {
      const entry = this.shown[this.index];
      return entry ? { run: entry.key } : {};
    }
    if (matchesKey(data, 'up')) return this.move(-1);
    if (matchesKey(data, 'down')) return this.move(1);
    this.input.handleInput(data);
    this.update();
    return {};
  }

  render(width: number, height: number, t: TFunction): string[] {
    const heading = `${paint.heading(t(`${NS}.palette.title`))}  ${paint.muted(
      t(`${NS}.palette.count`, { count: this.shown.length })
    )}`;
    if (this.shown.length === 0) {
      return [heading, '', paint.muted(`  ${t(`${NS}.palette.noMatch`)}`)];
    }
    const capacity = Math.max(1, height - 2);
    const start = Math.max(0, Math.min(this.index - capacity + 1, this.shown.length - capacity));
    const chordWidth = Math.max(...this.shown.map((e) => e.chord.length));
    const lines = this.shown.slice(start, start + capacity).map((entry, i) => {
      const labelWidth = Math.max(1, width - chordWidth - 4);
      const text = `  ${fit(entry.label, labelWidth)} ${fitRight(entry.chord, chordWidth)} `;
      return start + i === this.index
        ? paint.selected(stripStyles(text))
        : `  ${fit(entry.label, labelWidth)} ${paint.key(fitRight(entry.chord, chordWidth))} `;
    });
    return [heading, '', ...lines];
  }

  private move(delta: number): PaletteResult {
    this.index = Math.min(Math.max(0, this.index + delta), Math.max(0, this.shown.length - 1));
    return {};
  }

  private update(): void {
    const query = this.input.getValue().trim();
    this.shown = query
      ? fuzzyFilter(this.entries, query, (e) => `${e.label} ${e.chord}`)
      : [...this.entries];
    this.index = 0;
  }
}
