/**
 * Feature console rendering (spec 142): pure functions from the snapshot to
 * lines of text. Every function returns plain strings sized to the width it
 * is given; the view assembles them into one screen.
 */

import type { TFunction } from 'i18next';
import { wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { FeatureConsoleAction, FeatureState } from '@/domain/generated/output.js';
import { getAgentDescriptor } from '@/domain/shared/agent-catalog.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import {
  NO_VALUE,
  QUESTION_STYLE,
  STATE_STYLE,
  fit,
  fitRight,
  formatCost,
  formatDuration,
  formatTokens,
  paint,
  sanitizeText,
  stripStyles,
  type StateStyle,
} from './console-format.js';

const NS = 'tui:console';
const SEPARATOR = ' · ';
const STRIP_GAP = '   ';
const LABEL_WIDTH = 10;

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

// ── details, log, help, empty ────────────────────────────────────────────────

export function renderDetails(
  row: FeatureConsoleRow | undefined,
  t: TFunction,
  width: number
): string[] {
  if (!row) return [paint.muted(t(`${NS}.inspector.noSelection`))];
  const label = (key: string) => paint.label(fit(t(`${NS}.inspector.${key}`), LABEL_WIDTH));
  const style = styleOf(row);
  const lines = [
    `${paint.heading(row.name)}  ${paint.muted(row.shortId)}`,
    `${label('repo')}${row.repositoryName}`,
    `${label('branch')}${row.branch}`,
    ...(row.worktreePath ? [`${label('worktree')}${row.worktreePath}`] : []),
    `${label('state')}${style.paint(stateLabel(row, t))}${paint.muted(SEPARATOR)}${phaseLabel(row.phase, t)}`,
    `${label('agent')}${[agentLabel(row), row.modelId].filter(Boolean).join(SEPARATOR)}`,
    `${label('elapsed')}${formatDuration(row.elapsedMs)}`,
    `${label('cost')}${formatCost(row.costUsd)}`,
    `${label('tokens')}${t(`${NS}.inspector.tokensValue`, {
      input: formatTokens(row.inputTokens),
      output: formatTokens(row.outputTokens),
    })}`,
  ];
  if (row.pr) {
    const ci = row.pr.ciStatus ? `${SEPARATOR}CI ${row.pr.ciStatus}` : '';
    lines.push(`${label('pr')}#${row.pr.number} ${row.pr.status}${ci}`);
    lines.push(`${' '.repeat(LABEL_WIDTH)}${paint.muted(row.pr.url)}`);
  }
  if (row.pendingQuestions > 0) {
    lines.push(
      `${label('questions')}${paint.attention(
        t(`${NS}.inspector.questionsHint`, { count: row.pendingQuestions })
      )}`
    );
  }
  if (row.error) {
    const wrapped = wrapTextWithAnsi(sanitizeText(row.error), Math.max(1, width - LABEL_WIDTH));
    wrapped.forEach((text, i) =>
      lines.push(`${i === 0 ? label('error') : ' '.repeat(LABEL_WIDTH)}${paint.error(text)}`)
    );
  }
  return lines;
}

export function renderLog(
  row: FeatureConsoleRow | undefined,
  tail: FeatureLogTail | undefined,
  t: TFunction,
  width: number,
  height: number
): string[] {
  const fileName = tail?.logPath?.split(/[\\/]/).pop();
  const title = paint.heading(
    [t(`${NS}.log.title`), row?.name, fileName].filter(Boolean).join(SEPARATOR)
  );
  if (!row?.runId) return [title, paint.muted(t(`${NS}.log.noRun`))];
  if (!tail || tail.lines.length === 0) return [title, paint.muted(t(`${NS}.log.empty`))];
  // Wrap, then keep the newest rows: log lines carry long prefixes, and
  // truncating would hide the message that follows them.
  const rows = tail.lines.flatMap((line) =>
    wrapTextWithAnsi(sanitizeText(line), Math.max(1, width))
  );
  return [title, ...rows.slice(-(height - 1))];
}

const HELP_KEYS = [
  'navigate',
  'pages',
  'details',
  'log',
  'approve',
  'reject',
  'stop',
  'resume',
  'help',
  'quit',
] as const;

export function renderHelp(t: TFunction): string[] {
  return [
    paint.heading(t(`${NS}.help.title`)),
    '',
    ...HELP_KEYS.map((k) => `  ${t(`${NS}.help.${k}`)}`),
  ];
}

export function renderEmpty(t: TFunction): string[] {
  return [
    '',
    `  ${paint.heading(t(`${NS}.empty.title`))}`,
    `  ${paint.muted(t(`${NS}.empty.hint`))}`,
  ];
}

// ── key bar ──────────────────────────────────────────────────────────────────

const ACTION_KEY: Record<FeatureConsoleAction, string> = {
  [FeatureConsoleAction.Approve]: 'a',
  [FeatureConsoleAction.Reject]: 'r',
  [FeatureConsoleAction.Stop]: 's',
  [FeatureConsoleAction.Resume]: 'R',
};

/** Navigation and pane keys, then only the actions the selected row offers. */
export function renderKeyBar(row: FeatureConsoleRow | undefined, t: TFunction): string {
  const item = (key: string, label: string) => `${paint.key(key)} ${paint.muted(label)}`;
  const items = [
    item('↑↓', t(`${NS}.keys.select`)),
    item('enter', t(`${NS}.keys.details`)),
    item('l', t(`${NS}.keys.log`)),
    ...(row?.actions ?? []).map((a) => item(ACTION_KEY[a], t(`${NS}.keys.${a}`))),
    item('?', t(`${NS}.keys.help`)),
    item('q', t(`${NS}.keys.quit`)),
  ];
  return ` ${items.join('  ')}`;
}

// ── labels ───────────────────────────────────────────────────────────────────

function styleOf(row: FeatureConsoleRow): StateStyle {
  return row.needsAttention && row.state !== FeatureState.ActionRequired
    ? QUESTION_STYLE
    : STATE_STYLE[row.state];
}

function stateLabel(row: FeatureConsoleRow, t: TFunction): string {
  return row.needsAttention && row.state !== FeatureState.ActionRequired
    ? t(`${NS}.state.question`)
    : t(`${NS}.state.${row.state}`);
}

function phaseLabel(phase: string, t: TFunction): string {
  return t(`${NS}.phase.${phase}`, { defaultValue: phase });
}

function agentLabel(row: FeatureConsoleRow): string {
  if (!row.agentType) return NO_VALUE;
  return getAgentDescriptor(row.agentType)?.label ?? row.agentType;
}
