/**
 * Feature console screen (specs 142, 143): one full frame from the view's
 * state. Header, needs-you strip, body (help, empty state, or roster and
 * pane), status line and hint line — exactly `height` lines, each exactly
 * `width` columns.
 */

import type { TFunction } from 'i18next';
import type { Input } from '@mariozechner/pi-tui';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { fit, paint } from './console-format.js';
import { NS } from './console-labels.js';
import { composeBody, padTo } from './console-layout.js';
import {
  renderDetails,
  renderEmpty,
  renderHelp,
  renderKeyBar,
  renderLog,
} from './console-panes.js';
import { renderHeader, renderStrip } from './console-render.js';
import type { CommandPalette } from './console-palette.js';
import type { ConsoleRoster } from './console-roster.js';
import { renderStatusLine } from './console-status.js';

export enum ConsoleMode {
  Browse = 'browse',
  Help = 'help',
  Reject = 'reject',
  ConfirmStop = 'confirm-stop',
  Filter = 'filter',
  Palette = 'palette',
}

export enum ConsolePane {
  Details = 'details',
  Log = 'log',
}

/** Header, strip, status line, hint line. */
export const CHROME_LINES = 4;

export interface ConsoleFrame {
  mode: ConsoleMode;
  pane: ConsolePane;
  snapshot: FeatureConsoleSnapshot | undefined;
  roster: ConsoleRoster;
  log: FeatureLogTail | undefined;
  feedback: Input;
  filter: Input;
  palette: CommandPalette;
  busy: string | undefined;
  refreshError: string | undefined;
  result: FeatureConsoleActionResult | undefined;
}

export function renderConsoleFrame(
  frame: ConsoleFrame,
  t: TFunction,
  width: number,
  height: number
): string[] {
  const bodyHeight = Math.max(0, height - CHROME_LINES);
  const lines = [
    renderHeader(frame.snapshot, t),
    renderStrip(frame.roster.allRows, t),
    ...padTo(renderBody(frame, t, width, bodyHeight), bodyHeight),
    renderStatus(frame, t, width),
    renderHint(frame, t),
  ];
  return padTo(lines, height).map((line) => fit(line, width));
}

function renderBody(frame: ConsoleFrame, t: TFunction, width: number, height: number): string[] {
  if (frame.mode === ConsoleMode.Help) return renderHelp(t);
  if (frame.mode === ConsoleMode.Palette) return frame.palette.render(width, height, t);
  if (frame.roster.allRows.length === 0 && frame.snapshot) return renderEmpty(t);
  const selected = frame.roster.selected;
  return composeBody(
    width,
    height,
    (w, h) => frame.roster.render(w, h, t),
    (w, h) =>
      (frame.pane === ConsolePane.Log
        ? renderLog(selected, frame.log, t, w, h)
        : renderDetails(selected, t, w)
      ).slice(0, h)
  );
}

function renderStatus(frame: ConsoleFrame, t: TFunction, width: number): string {
  const name = frame.roster.selected?.name ?? '';
  const prompt =
    frame.mode === ConsoleMode.Reject
      ? { label: t(`${NS}.reject.prompt`, { name }), input: frame.feedback }
      : frame.mode === ConsoleMode.Filter
        ? { label: '/', input: frame.filter }
        : frame.mode === ConsoleMode.Palette
          ? { label: ':', input: frame.palette.input }
          : undefined;
  return renderStatusLine(
    {
      prompt,
      confirm:
        frame.mode === ConsoleMode.ConfirmStop ? t(`${NS}.stop.confirm`, { name }) : undefined,
      busy: frame.busy,
      refreshError: frame.refreshError,
      result: frame.result,
      filter: {
        query: frame.roster.query.trim(),
        shown: frame.roster.rows.length,
        total: frame.roster.allRows.length,
      },
    },
    t,
    width
  );
}

function renderHint(frame: ConsoleFrame, t: TFunction): string {
  if (frame.mode === ConsoleMode.Reject) return paint.muted(` ${t(`${NS}.reject.hint`)}`);
  if (frame.mode === ConsoleMode.Filter) return paint.muted(` ${t(`${NS}.filter.hint`)}`);
  if (frame.mode === ConsoleMode.Palette) return paint.muted(` ${t(`${NS}.palette.hint`)}`);
  return renderKeyBar(frame.roster.selected, t);
}
