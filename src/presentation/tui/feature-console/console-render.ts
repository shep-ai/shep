/**
 * Feature console rendering (spec 142): pure functions from the snapshot to
 * the header, the needs-you strip and the roster. Every function returns plain
 * strings sized to the width it is given; the view assembles them into one
 * screen.
 */

import type { TFunction } from 'i18next';
import { FeatureState } from '@/domain/generated/output.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { fit, fitRight, formatCost, formatDuration, paint, stripStyles } from './console-format.js';
import { NS, SEPARATOR, agentLabel, phaseLabel, stateLabel, styleOf } from './console-labels.js';

const STRIP_GAP = '   ';

// ── header and strip ─────────────────────────────────────────────────────────

export function renderHeader(snapshot: FeatureConsoleSnapshot | undefined, t: TFunction): string {
  const title = paint.title(` shep · ${t(`${NS}.title`)} `);
  if (!snapshot) return title;
  const s = snapshot.summary;
  const parts = [
    s.needsAttention > 0
      ? paint.attention(`${s.needsAttention} ${t(`${NS}.summary.needsYou`)}`)
      : paint.muted(`0 ${t(`${NS}.summary.needsYou`)}`),
    `${s.running} ${t(`${NS}.summary.running`)}`,
    `${s.waiting} ${t(`${NS}.summary.waiting`)}`,
    s.failed > 0
      ? paint.error(`${s.failed} ${t(`${NS}.summary.failed`)}`)
      : `0 ${t(`${NS}.summary.failed`)}`,
    `${s.done} ${t(`${NS}.summary.done`)}`,
  ];
  return `${title}  ${parts.join(paint.muted(SEPARATOR))}`;
}

export function renderStrip(rows: readonly FeatureConsoleRow[], t: TFunction): string {
  const label = paint.attention(` ${t(`${NS}.strip.label`)} `);
  const waiting = rows.filter((r) => r.needsAttention);
  if (waiting.length === 0) {
    return `${paint.muted(` ${t(`${NS}.strip.label`)} `)} ${paint.muted(t(`${NS}.strip.empty`))}`;
  }
  const entries = waiting.map((r) => {
    const style = styleOf(r);
    const reason =
      r.state === FeatureState.ActionRequired
        ? t(`${NS}.strip.gate`, { phase: phaseLabel(r.phase, t) })
        : t(`${NS}.strip.questions`, { count: r.pendingQuestions });
    return `${style.paint(style.symbol)} ${r.name}${paint.muted(SEPARATOR)}${reason}`;
  });
  return `${label} ${entries.join(STRIP_GAP)}`;
}

// ── roster ───────────────────────────────────────────────────────────────────

enum Column {
  Phase = 'phase',
  Elapsed = 'elapsed',
  Cost = 'cost',
  Repo = 'repo',
  Agent = 'agent',
}

const MARKER_WIDTH = 2;
const STATE_WIDTH = 12;
const MIN_NAME_WIDTH = 14;
const COLUMN_GAP = 1;

const COLUMN_WIDTH: Record<Column, number> = {
  [Column.Phase]: 13,
  [Column.Elapsed]: 7,
  [Column.Cost]: 7,
  [Column.Repo]: 14,
  [Column.Agent]: 12,
};

/** Display order of the optional columns after the name. */
const COLUMN_ORDER: readonly Column[] = [
  Column.Repo,
  Column.Phase,
  Column.Agent,
  Column.Elapsed,
  Column.Cost,
];

/** The order optional columns are dropped in as the roster narrows. */
const DROP_ORDER: readonly Column[] = [
  Column.Agent,
  Column.Repo,
  Column.Cost,
  Column.Phase,
  Column.Elapsed,
];

export interface RosterLayout {
  nameWidth: number;
  columns: Column[];
}

export function rosterLayout(width: number): RosterLayout {
  const shown = new Set(COLUMN_ORDER);
  const used = () =>
    MARKER_WIDTH +
    STATE_WIDTH +
    COLUMN_GAP +
    [...shown].reduce((sum, c) => sum + COLUMN_WIDTH[c] + COLUMN_GAP, 0);
  for (const column of DROP_ORDER) {
    if (width - used() >= MIN_NAME_WIDTH) break;
    shown.delete(column);
  }
  return {
    nameWidth: Math.max(MIN_NAME_WIDTH, width - used()),
    columns: COLUMN_ORDER.filter((c) => shown.has(c)),
  };
}

const RIGHT_ALIGNED: ReadonlySet<Column> = new Set([Column.Elapsed, Column.Cost]);

function cell(column: Column, text: string): string {
  const width = COLUMN_WIDTH[column];
  return RIGHT_ALIGNED.has(column) ? fitRight(text, width) : fit(text, width);
}

export function renderRosterHeader(layout: RosterLayout, t: TFunction): string {
  const head = (key: string) => t(`${NS}.columns.${key}`);
  const cells = [
    ' '.repeat(MARKER_WIDTH) + fit(head('state'), STATE_WIDTH),
    fit(head('feature'), layout.nameWidth),
    ...layout.columns.map((c) => cell(c, head(c))),
  ];
  return paint.label(cells.join(' '));
}

export function renderRosterRow(
  row: FeatureConsoleRow,
  layout: RosterLayout,
  t: TFunction,
  selected: boolean
): string {
  const style = styleOf(row);
  const values: Record<Column, string> = {
    [Column.Phase]: phaseLabel(row.phase, t),
    [Column.Elapsed]: formatDuration(row.elapsedMs),
    [Column.Cost]: formatCost(row.costUsd),
    [Column.Repo]: row.repositoryName,
    [Column.Agent]: agentLabel(row),
  };
  const stateText = fit(`${style.symbol} ${stateLabel(row, t)}`, STATE_WIDTH);
  const cells = [fit(row.name, layout.nameWidth), ...layout.columns.map((c) => cell(c, values[c]))];
  if (selected) {
    // One plain highlight bar: colours inside an inverse bar turn into blocks,
    // and the reset truncation appends after "…" would end the bar early.
    return paint.key('▸ ') + paint.selected(stripStyles([stateText, ...cells].join(' ')));
  }
  return `  ${[style.paint(stateText), ...cells].join(' ')}`;
}
