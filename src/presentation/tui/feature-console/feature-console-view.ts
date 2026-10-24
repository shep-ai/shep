/**
 * Feature console view (spec 142).
 *
 * A pi-tui Component that draws one full screen: header, needs-you strip,
 * roster, a details or log pane, a status line and a key bar. It holds only
 * UI state (selection, mode, pane); everything about the features comes from
 * the snapshot, and every key that changes something becomes an intent the
 * app carries out through a use case.
 */

import type { TFunction } from 'i18next';
import { Input, matchesKey, type Component } from '@mariozechner/pi-tui';
import { FeatureConsoleAction } from '@/domain/generated/output.js';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { ConsoleKey, resolveConsoleKey } from './console-keys.js';
import { fit, paint, sanitizeText } from './console-format.js';
import {
  renderDetails,
  renderEmpty,
  renderHeader,
  renderHelp,
  renderKeyBar,
  renderLog,
  renderRosterHeader,
  renderRosterRow,
  renderStrip,
  rosterLayout,
} from './console-render.js';

/** What the view asks the app to do. */
export interface FeatureConsoleIntents {
  runAction(row: FeatureConsoleRow, action: FeatureConsoleAction, feedback?: string): void;
  /** Load (and keep refreshing) the log of this feature; undefined stops it. */
  showLog(row: FeatureConsoleRow | undefined): void;
  quit(): void;
  requestRender(): void;
}

export interface FeatureConsoleViewDeps {
  t: TFunction;
  /** Terminal height; the view always renders exactly this many lines. */
  rows: () => number;
  intents: FeatureConsoleIntents;
}

enum Mode {
  Browse = 'browse',
  Help = 'help',
  Reject = 'reject',
  ConfirmStop = 'confirm-stop',
}

enum Pane {
  Details = 'details',
  Log = 'log',
}

const NS = 'tui:console';
/** Header, strip, status line, key bar. */
const CHROME_LINES = 4;
/** At or above this width the pane sits beside the roster instead of below it. */
const SPLIT_MIN_WIDTH = 110;
const SPLIT_ROSTER_SHARE = 0.6;
const SPLIT_DIVIDER = ' │ ';
const STACKED_PANE_SHARE = 0.45;
const STACKED_PANE_MAX = 9;
/** Below this body height there is no room for a pane at all. */
const MIN_BODY_FOR_PANE = 6;

/** Keys that run an action directly (reject and stop open a prompt first). */
const DIRECT_ACTIONS: Partial<Record<ConsoleKey, FeatureConsoleAction>> = {
  [ConsoleKey.Approve]: FeatureConsoleAction.Approve,
  [ConsoleKey.Resume]: FeatureConsoleAction.Resume,
};

export class FeatureConsoleView implements Component {
  private snapshot: FeatureConsoleSnapshot | undefined;
  private selectedId: string | undefined;
  private scrollOffset = 0;
  private mode = Mode.Browse;
  private pane = Pane.Details;
  private log: FeatureLogTail | undefined;
  private busy: string | undefined;
  private status: FeatureConsoleActionResult | undefined;
  private refreshError: string | undefined;
  private readonly feedback = new Input();

  constructor(private readonly deps: FeatureConsoleViewDeps) {
    this.feedback.onSubmit = (value) => this.submitReject(value);
    this.feedback.onEscape = () => this.closePrompt();
  }

  // ── state from the app ─────────────────────────────────────────────────────

  setSnapshot(snapshot: FeatureConsoleSnapshot): void {
    this.snapshot = snapshot;
    const stillThere = snapshot.rows.some((r) => r.featureId === this.selectedId);
    if (!stillThere) this.selectedId = snapshot.rows[0]?.featureId;
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
    return this.rows.find((r) => r.featureId === this.selectedId);
  }

  get logOpen(): boolean {
    return this.pane === Pane.Log;
  }

  private get rows(): readonly FeatureConsoleRow[] {
    return this.snapshot?.rows ?? [];
  }

  // ── input ──────────────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const key = resolveConsoleKey(data);
    if (this.mode === Mode.Reject) {
      // Letters are feedback text here; only ctrl+c still means quit.
      if (key === ConsoleKey.Quit && matchesKey(data, 'ctrl+c')) this.deps.intents.quit();
      else this.feedback.handleInput(data);
      return;
    }
    if (key === undefined) return;

    if (this.mode === Mode.ConfirmStop) {
      if (key === ConsoleKey.Confirm) this.act(FeatureConsoleAction.Stop);
      if (key === ConsoleKey.Quit) this.deps.intents.quit();
      this.mode = Mode.Browse;
      return;
    }
    if (this.mode === Mode.Help) {
      if (key === ConsoleKey.Quit) this.deps.intents.quit();
      this.mode = Mode.Browse;
      return;
    }
    this.handleBrowseKey(key);
  }

  private handleBrowseKey(key: ConsoleKey): void {
    switch (key) {
      case ConsoleKey.Up:
        return this.moveSelection(-1);
      case ConsoleKey.Down:
        return this.moveSelection(1);
      case ConsoleKey.PageUp:
        return this.moveSelection(-this.rosterCapacity());
      case ConsoleKey.PageDown:
        return this.moveSelection(this.rosterCapacity());
      case ConsoleKey.First:
        return this.moveSelection(-this.rows.length);
      case ConsoleKey.Last:
        return this.moveSelection(this.rows.length);
      case ConsoleKey.Details:
        this.pane = Pane.Details;
        this.deps.intents.showLog(undefined);
        return;
      case ConsoleKey.Log:
        this.pane = Pane.Log;
        this.log = undefined;
        this.deps.intents.showLog(this.selectedRow);
        return;
      case ConsoleKey.Help:
        this.mode = Mode.Help;
        return;
      case ConsoleKey.Quit:
      case ConsoleKey.Escape:
        this.deps.intents.quit();
        return;
      case ConsoleKey.Reject:
        if (this.offers(FeatureConsoleAction.Reject)) this.openPrompt(Mode.Reject);
        return;
      case ConsoleKey.Stop:
        if (this.offers(FeatureConsoleAction.Stop)) this.openPrompt(Mode.ConfirmStop);
        return;
      default: {
        const action = DIRECT_ACTIONS[key];
        if (action) this.act(action);
      }
    }
  }

  private moveSelection(delta: number): void {
    const rows = this.rows;
    if (rows.length === 0) return;
    const current = Math.max(
      0,
      rows.findIndex((r) => r.featureId === this.selectedId)
    );
    const next = Math.min(rows.length - 1, Math.max(0, current + delta));
    if (rows[next].featureId === this.selectedId) return;
    this.selectedId = rows[next].featureId;
    // The last action's result belongs to the feature it was run on.
    this.status = undefined;
    if (this.pane === Pane.Log) {
      this.log = undefined;
      this.deps.intents.showLog(rows[next]);
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

  private openPrompt(mode: Mode.Reject | Mode.ConfirmStop): void {
    this.mode = mode;
    if (mode === Mode.Reject) {
      this.feedback.setValue('');
      this.feedback.focused = true;
    }
  }

  private closePrompt(): void {
    this.feedback.focused = false;
    this.mode = Mode.Browse;
    this.deps.intents.requestRender();
  }

  private submitReject(value: string): void {
    const feedback = value.trim();
    if (!feedback) return;
    this.closePrompt();
    this.act(FeatureConsoleAction.Reject, feedback);
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  invalidate(): void {
    // Nothing cached: every render is computed from current state.
  }

  render(width: number): string[] {
    const height = this.deps.rows();
    const { t } = this.deps;
    const bodyHeight = Math.max(0, height - CHROME_LINES);
    const body =
      this.mode === Mode.Help
        ? renderHelp(t)
        : this.rows.length === 0 && this.snapshot
          ? renderEmpty(t)
          : this.renderBody(width, bodyHeight);

    const lines = [
      renderHeader(this.snapshot, t),
      renderStrip(this.rows, t),
      ...padTo(body, bodyHeight),
      this.renderStatusLine(width),
      this.mode === Mode.Reject
        ? paint.muted(` ${t(`${NS}.reject.hint`)}`)
        : renderKeyBar(this.selectedRow, t),
    ];
    return padTo(lines, height).map((line) => fit(line, width));
  }

  private renderBody(width: number, height: number): string[] {
    if (width >= SPLIT_MIN_WIDTH) {
      const rosterWidth = Math.floor(width * SPLIT_ROSTER_SHARE);
      const paneWidth = width - rosterWidth - SPLIT_DIVIDER.length;
      const roster = this.renderRoster(rosterWidth, height);
      const pane = padTo(this.renderPane(paneWidth, height), height);
      return roster.map(
        (line, i) => fit(line, rosterWidth) + paint.border(SPLIT_DIVIDER) + fit(pane[i], paneWidth)
      );
    }
    if (height < MIN_BODY_FOR_PANE) return this.renderRoster(width, height);
    const paneHeight = Math.min(STACKED_PANE_MAX, Math.floor(height * STACKED_PANE_SHARE));
    const rosterHeight = height - paneHeight - 1;
    return [
      ...this.renderRoster(width, rosterHeight),
      paint.border('─'.repeat(width)),
      ...padTo(this.renderPane(width, paneHeight), paneHeight),
    ];
  }

  private renderRoster(width: number, height: number): string[] {
    const layout = rosterLayout(width);
    const visible = Math.max(1, height - 1);
    const index = Math.max(
      0,
      this.rows.findIndex((r) => r.featureId === this.selectedId)
    );
    if (index < this.scrollOffset) this.scrollOffset = index;
    if (index >= this.scrollOffset + visible) this.scrollOffset = index - visible + 1;
    this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.rows.length - visible));

    const shown = this.rows.slice(this.scrollOffset, this.scrollOffset + visible);
    return padTo(
      [
        renderRosterHeader(layout, this.deps.t),
        ...shown.map((r) =>
          renderRosterRow(r, layout, this.deps.t, r.featureId === this.selectedId)
        ),
      ],
      height
    );
  }

  private renderPane(width: number, height: number): string[] {
    const lines =
      this.pane === Pane.Log
        ? renderLog(this.selectedRow, this.log, this.deps.t, width, height)
        : renderDetails(this.selectedRow, this.deps.t, width);
    return lines.slice(0, height);
  }

  /** Lines this roster can show at the current height, for paging. */
  private rosterCapacity(): number {
    return Math.max(1, this.deps.rows() - CHROME_LINES - 1);
  }

  private renderStatusLine(width: number): string {
    const { t } = this.deps;
    const name = this.selectedRow?.name ?? '';
    if (this.mode === Mode.Reject) {
      const prompt = ` ${t(`${NS}.reject.prompt`, { name })} `;
      const [input] = this.feedback.render(Math.max(1, width - prompt.length));
      return paint.attention(prompt) + input;
    }
    if (this.mode === Mode.ConfirmStop) {
      return paint.attention(` ${t(`${NS}.stop.confirm`, { name })}`);
    }
    if (this.busy) return paint.muted(` ${this.busy}`);
    if (this.refreshError) {
      return paint.error(
        ` ${t(`${NS}.refreshFailed`, { message: sanitizeText(this.refreshError) })}`
      );
    }
    if (this.status) {
      const message = sanitizeText(this.status.message);
      return this.status.ok ? paint.ok(` ✓ ${message}`) : paint.error(` ✗ ${message}`);
    }
    return '';
  }
}

function padTo(lines: string[], height: number): string[] {
  if (lines.length >= height) return lines.slice(0, height);
  return [...lines, ...Array.from({ length: height - lines.length }, () => '')];
}
