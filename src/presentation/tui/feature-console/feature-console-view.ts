/**
 * Feature console view (specs 142, 143, 145).
 *
 * A pi-tui Component that draws one full screen: header, needs-you strip,
 * roster, a details or log pane, a status line and a key bar. It holds only
 * UI state (mode, pane, prompts); the roster holds selection and the filter.
 * Everything about the features comes from the snapshot, and every key that
 * changes something becomes an intent the app carries out through a use case.
 */

import { Input, matchesKey, type Component } from '@mariozechner/pi-tui';
import { FeatureConsoleAction, FeaturePaneContent } from '@/domain/generated/output.js';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { ConsoleKey, DIRECT_ACTIONS, PANE_KEYS, resolveConsoleKey } from './console-keys.js';
import type { FeatureConsoleViewDeps } from './console-intents.js';
import { CommandPalette, paletteEntries } from './console-palette.js';
import { ConsoleRoster } from './console-roster.js';
import { CHROME_LINES, ConsoleMode, ConsolePane, renderConsoleFrame } from './console-screen.js';

export type { FeatureConsoleIntents, FeatureConsoleViewDeps } from './console-intents.js';

export class FeatureConsoleView implements Component {
  private snapshot: FeatureConsoleSnapshot | undefined;
  private readonly roster = new ConsoleRoster();
  private mode = ConsoleMode.Browse;
  private pane = ConsolePane.Details;
  private log: FeatureLogTail | undefined;
  private busy: string | undefined;
  private status: FeatureConsoleActionResult | undefined;
  private refreshError: string | undefined;
  private readonly feedback = new Input();
  private readonly filter = new Input();
  private readonly palette = new CommandPalette();

  constructor(private readonly deps: FeatureConsoleViewDeps) {
    this.feedback.onSubmit = (value) => this.submitReject(value);
    this.feedback.onEscape = () => this.closePrompt(this.feedback);
    this.filter.onSubmit = () => this.closePrompt(this.filter);
    this.filter.onEscape = () => {
      this.filter.setValue('');
      this.applyFilter();
      this.closePrompt(this.filter);
    };
  }

  // ── state from the app ─────────────────────────────────────────────────────

  setSnapshot(snapshot: FeatureConsoleSnapshot): void {
    this.snapshot = snapshot;
    this.roster.setRows(snapshot.rows);
    this.refreshError = undefined;
  }

  setRefreshError(message: string | undefined): void {
    this.refreshError = message;
  }

  setLog(tail: FeatureLogTail): void {
    this.log = tail;
  }

  /** Text shown while an action runs; undefined when it finished. */
  setBusy(text: string | undefined): void {
    this.busy = text;
  }

  setStatus(result: FeatureConsoleActionResult | undefined): void {
    this.status = result;
  }

  get selectedRow(): FeatureConsoleRow | undefined {
    return this.roster.selected;
  }

  get logOpen(): boolean {
    return this.pane === ConsolePane.Log;
  }

  // ── input ──────────────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const key = resolveConsoleKey(data);
    if (this.mode === ConsoleMode.Palette) return this.handlePaletteInput(data, key);
    const prompt =
      this.mode === ConsoleMode.Reject
        ? this.feedback
        : this.mode === ConsoleMode.Filter
          ? this.filter
          : undefined;
    if (prompt) {
      // Letters are text here; only ctrl+c still means quit.
      if (key === ConsoleKey.Quit && matchesKey(data, 'ctrl+c')) return this.deps.intents.quit();
      prompt.handleInput(data);
      if (prompt === this.filter && this.mode === ConsoleMode.Filter) this.applyFilter();
      return;
    }
    if (key === undefined) return;

    if (this.mode === ConsoleMode.ConfirmStop) {
      if (key === ConsoleKey.Confirm) this.act(FeatureConsoleAction.Stop);
      if (key === ConsoleKey.Quit) this.deps.intents.quit();
      this.mode = ConsoleMode.Browse;
      return;
    }
    if (this.mode === ConsoleMode.Help) {
      if (key === ConsoleKey.Quit) this.deps.intents.quit();
      this.mode = ConsoleMode.Browse;
      return;
    }
    this.handleBrowseKey(key);
  }

  private handlePaletteInput(data: string, key: ConsoleKey | undefined): void {
    if (key === ConsoleKey.Quit && matchesKey(data, 'ctrl+c')) return this.deps.intents.quit();
    const result = this.palette.handleInput(data);
    if (!result.close && !result.run) return;
    this.palette.close();
    this.mode = ConsoleMode.Browse;
    // The palette replays the key: one path per command, with the key's own guards.
    if (result.run) this.handleBrowseKey(result.run);
  }

  private handleBrowseKey(key: ConsoleKey): void {
    switch (key) {
      case ConsoleKey.Palette:
        this.palette.open(
          paletteEntries(
            { row: this.selectedRow, filterActive: this.roster.query.trim() !== '' },
            this.deps.t
          )
        );
        this.mode = ConsoleMode.Palette;
        return;
      case ConsoleKey.ClearFilter:
        this.filter.setValue('');
        return this.applyFilter();
      case ConsoleKey.Up:
        return this.moveSelection(-1);
      case ConsoleKey.Down:
        return this.moveSelection(1);
      case ConsoleKey.PageUp:
        return this.moveSelection(-this.rosterCapacity());
      case ConsoleKey.PageDown:
        return this.moveSelection(this.rosterCapacity());
      case ConsoleKey.First:
        return this.moveSelection(-this.roster.rows.length);
      case ConsoleKey.Last:
        return this.moveSelection(this.roster.rows.length);
      case ConsoleKey.Details:
        this.pane = ConsolePane.Details;
        this.deps.intents.showLog(undefined);
        return;
      case ConsoleKey.Log:
        this.pane = ConsolePane.Log;
        this.log = undefined;
        this.deps.intents.showLog(this.selectedRow);
        return;
      case ConsoleKey.Filter:
        return this.openPrompt(ConsoleMode.Filter);
      case ConsoleKey.Help:
        this.mode = ConsoleMode.Help;
        return;
      case ConsoleKey.Quit:
      case ConsoleKey.Escape:
        this.deps.intents.quit();
        return;
      case ConsoleKey.Reject:
        if (this.offers(FeatureConsoleAction.Reject)) this.openPrompt(ConsoleMode.Reject);
        return;
      case ConsoleKey.Stop:
        if (this.offers(FeatureConsoleAction.Stop)) this.openPrompt(ConsoleMode.ConfirmStop);
        return;
      default:
        return this.runKey(key);
    }
  }

  private runKey(key: ConsoleKey): void {
    const action = DIRECT_ACTIONS[key];
    if (action) return this.act(action);
    const row = this.selectedRow;
    if (key === ConsoleKey.CopyId && row) return this.deps.intents.copyId(row);
    const pane = PANE_KEYS[key];
    if (!pane || !row) return;
    const [content, placement] = pane;
    if (content === FeaturePaneContent.Log && !row.runId) return;
    this.deps.intents.openPane(row, content, placement);
  }

  private moveSelection(delta: number): void {
    if (this.roster.move(delta)) this.selectionChanged();
  }

  private applyFilter(): void {
    const before = this.selectedRow?.featureId;
    this.roster.setQuery(this.filter.getValue());
    if (this.selectedRow?.featureId !== before) this.selectionChanged();
  }

  private selectionChanged(): void {
    // The last action's result belongs to the feature it was run on.
    this.status = undefined;
    if (this.pane === ConsolePane.Log) {
      this.log = undefined;
      this.deps.intents.showLog(this.selectedRow);
    }
  }

  private offers(action: FeatureConsoleAction): boolean {
    return !this.busy && (this.selectedRow?.actions.includes(action) ?? false);
  }

  private act(action: FeatureConsoleAction, feedback?: string): void {
    const row = this.selectedRow;
    if (!row || !this.offers(action)) return;
    this.status = undefined;
    this.deps.intents.runAction(row, action, feedback);
  }

  private openPrompt(
    mode: ConsoleMode.Reject | ConsoleMode.ConfirmStop | ConsoleMode.Filter
  ): void {
    this.mode = mode;
    if (mode === ConsoleMode.Reject) this.feedback.setValue('');
    if (mode === ConsoleMode.Reject) this.feedback.focused = true;
    if (mode === ConsoleMode.Filter) this.filter.focused = true;
  }

  private closePrompt(prompt: Input): void {
    prompt.focused = false;
    this.mode = ConsoleMode.Browse;
    this.deps.intents.requestRender();
  }

  private submitReject(value: string): void {
    const feedback = value.trim();
    if (!feedback) return;
    this.closePrompt(this.feedback);
    this.act(FeatureConsoleAction.Reject, feedback);
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  invalidate(): void {
    // Nothing cached: every render is computed from current state.
  }

  render(width: number): string[] {
    return renderConsoleFrame(
      {
        mode: this.mode,
        pane: this.pane,
        snapshot: this.snapshot,
        roster: this.roster,
        log: this.log,
        feedback: this.feedback,
        filter: this.filter,
        palette: this.palette,
        busy: this.busy,
        refreshError: this.refreshError,
        result: this.status,
      },
      this.deps.t,
      width,
      this.deps.rows()
    );
  }

  /** Lines this roster can show at the current height, for paging. */
  private rosterCapacity(): number {
    return Math.max(1, this.deps.rows() - CHROME_LINES - 1);
  }
}
