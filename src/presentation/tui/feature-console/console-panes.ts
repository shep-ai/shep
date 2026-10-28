/**
 * Feature console panes (spec 142): the inspector, the log, help, the empty
 * state and the key bar. Pure functions from state to lines of text.
 */

import type { TFunction } from 'i18next';
import { wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { FeatureConsoleAction } from '@/domain/generated/output.js';
import type {
  FeatureConsoleRow,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import {
  fit,
  formatCost,
  formatDuration,
  formatTokens,
  paint,
  sanitizeText,
} from './console-format.js';
import { NS, SEPARATOR, agentLabel, phaseLabel, stateLabel, styleOf } from './console-labels.js';

const LABEL_WIDTH = 10;

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
  'releaseQueue',
  'chat',
  'shell',
  'follow',
  'filter',
  'copyId',
  'controlCenter',
  'palette',
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

/**
 * Navigation and pane keys, the actions the selected row offers, then pane and
 * filter keys. `releaseQueue` adds the fleet-level key, which exists only while
 * a pause is in force — the same rule the row actions follow.
 */
export function renderKeyBar(
  row: FeatureConsoleRow | undefined,
  t: TFunction,
  releaseQueue = false
): string {
  const item = (key: string, label: string) => `${paint.key(key)} ${paint.muted(label)}`;
  const items = [
    item('↑↓', t(`${NS}.keys.select`)),
    item('enter', t(`${NS}.keys.details`)),
    item('l', t(`${NS}.keys.log`)),
    ...(row?.actions ?? []).map((a) => item(ACTION_KEY[a], t(`${NS}.keys.${a}`))),
    ...(row ? [item('o', t(`${NS}.keys.chat`)), item('t', t(`${NS}.keys.shell`))] : []),
    ...(row?.runId ? [item('f', t(`${NS}.keys.follow`))] : []),
    ...(releaseQueue ? [item('u', t(`${NS}.keys.releaseQueue`))] : []),
    item('/', t(`${NS}.keys.filter`)),
    item('ctrl+p', t(`${NS}.keys.palette`)),
    item('?', t(`${NS}.keys.help`)),
    item('q', t(`${NS}.keys.quit`)),
  ];
  return ` ${items.join('  ')}`;
}
