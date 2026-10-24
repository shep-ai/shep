/**
 * `shep ps` rendering (spec 144): rows from ListShepProcessesUseCase to a
 * list view, a summary line and notes. Formatting only; every decision about
 * a process (kind, state, order) arrives in the rows.
 */

import { EOL } from 'node:os';
import type { TFunction } from 'i18next';
import { ShepProcessKind, ShepProcessState } from '@/domain/generated/output.js';
import { getAgentDescriptor } from '@/domain/shared/agent-catalog.js';
import type {
  ShepProcessList,
  ShepProcessRow,
} from '@/application/use-cases/processes/shep-process.types.js';
import { formatDuration } from '../../../tui/feature-console/console-format.js';
import { colors, symbols } from '../../ui/index.js';
import type { ListViewConfig } from '../../ui/list-view.js';

const NS = 'cli:commands.ps';
const NO_VALUE = '—';
const SEPARATOR = ' · ';
const BYTES_PER_MB = 1024 * 1024;
const MB_PER_GB = 1024;
const DECIMALS = 1;

const KIND_KEY: Record<ShepProcessKind, string> = {
  [ShepProcessKind.Daemon]: 'daemon',
  [ShepProcessKind.FeatureAgent]: 'featureAgent',
  [ShepProcessKind.AgentRun]: 'agentRun',
};

const STATE_LOOK: Record<ShepProcessState, { symbol: string; paint: (text: string) => string }> = {
  [ShepProcessState.Running]: { symbol: symbols.dot, paint: colors.info },
  [ShepProcessState.Crashed]: { symbol: symbols.error, paint: colors.error },
  [ShepProcessState.Exited]: { symbol: symbols.dotEmpty, paint: colors.muted },
};

const FEATURE_WIDTH = 30;
const ELLIPSIS = '…';

const COLUMNS = [
  ['kind', 14],
  ['pid', 8],
  ['feature', FEATURE_WIDTH],
  ['agent', 14],
  ['status', 28],
  ['up', 8],
  ['cpu', 7],
  ['mem', 9],
] as const;

/** `150.0 MB`, `1.2 GB`. */
export function formatBytes(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  return mb >= MB_PER_GB
    ? `${(mb / MB_PER_GB).toFixed(DECIMALS)} GB`
    : `${mb.toFixed(DECIMALS)} MB`;
}

/** At most `max` characters, ending in an ellipsis when cut. */
function shorten(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + ELLIPSIS;
}

function featureCell(row: ShepProcessRow): string {
  if (row.url) return row.url;
  if (!row.featureId) return row.runShortId ? colors.muted(row.runShortId) : NO_VALUE;
  const shortId = row.featureShortId ?? '';
  // Name and id share the column; the id always shows in full.
  const name = shorten(row.featureName ?? '', FEATURE_WIDTH - shortId.length - 1);
  return `${name} ${colors.muted(shortId)}`.trim();
}

function agentCell(row: ShepProcessRow): string {
  if (!row.agentType) return NO_VALUE;
  return getAgentDescriptor(row.agentType)?.label ?? row.agentType;
}

function statusCell(row: ShepProcessRow, t: TFunction): string {
  const look = STATE_LOOK[row.state];
  const state = `${look.symbol} ${t(`${NS}.state.${row.state}`)}`;
  // An exited run says why: finished, failed, or paused at a gate.
  const detail =
    row.state === ShepProcessState.Exited && row.runStatus ? `${SEPARATOR}${row.runStatus}` : '';
  return look.paint(state + detail);
}

function toCells(row: ShepProcessRow, t: TFunction): string[] {
  return [
    t(`${NS}.kind.${KIND_KEY[row.kind]}`),
    String(row.pid),
    featureCell(row),
    agentCell(row),
    statusCell(row, t),
    row.uptimeMs === undefined ? NO_VALUE : formatDuration(row.uptimeMs),
    row.cpuPercent === undefined ? NO_VALUE : `${row.cpuPercent.toFixed(DECIMALS)}%`,
    row.rssBytes === undefined ? NO_VALUE : formatBytes(row.rssBytes),
  ];
}

export function processTable(list: ShepProcessList, t: TFunction): ListViewConfig {
  return {
    title: t(`${NS}.title`),
    columns: COLUMNS.map(([key, width]) => ({ label: t(`${NS}.columns.${key}`), width })),
    rows: list.processes.map((row) => toCells(row, t)),
    emptyMessage: t(`${NS}.empty`),
  };
}

/** Summary and notes printed under the table; empty when there is nothing to list. */
export function processFooter(list: ShepProcessList, t: TFunction): string {
  if (list.processes.length === 0) return '';
  const lines = [`  ${colors.muted(t(`${NS}.summary`, { ...list.summary }))}`];
  if (list.summary.crashed > 0) lines.push(`  ${colors.muted(t(`${NS}.crashedHint`))}`);
  const missingStats = list.processes.some(
    (p) => p.state === ShepProcessState.Running && p.cpuPercent === undefined
  );
  if (missingStats) lines.push(`  ${colors.muted(t(`${NS}.statsUnavailable`))}`);
  return lines.join(EOL) + EOL;
}

/** The list as JSON: the same rows, no colour. */
export function processJson(list: ShepProcessList): string {
  return JSON.stringify(list, null, 2) + EOL;
}
