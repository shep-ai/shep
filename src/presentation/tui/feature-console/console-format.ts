/**
 * Feature console formatting (spec 142): pure text helpers and the state
 * palette. No decisions about features live here — only how values look.
 */

import pc from 'picocolors';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { FeatureState } from '@/domain/generated/output.js';
import { colors } from '../../cli/ui/colors.js';

export const ELLIPSIS = '…';
export const NO_VALUE = '—';

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_M = 60;
const DAY_H = 24;
const THOUSAND = 1000;
const MILLION = 1_000_000;
/** Costs at or above this many dollars drop the cents. */
const WHOLE_DOLLAR_THRESHOLD = 100;

/** `45s`, `12m`, `1h 05m`, `3d`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / SECOND_MS));
  if (seconds < MINUTE_S) return `${seconds}s`;
  const minutes = Math.floor(seconds / MINUTE_S);
  if (minutes < HOUR_M) return `${minutes}m`;
  const hours = Math.floor(minutes / HOUR_M);
  if (hours < DAY_H) return `${hours}h ${String(minutes % HOUR_M).padStart(2, '0')}m`;
  return `${Math.floor(hours / DAY_H)}d`;
}

/** `$0.42`, `$123`, or a dash when no phase reported a cost. */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return NO_VALUE;
  return usd >= WHOLE_DOLLAR_THRESHOLD ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`;
}

/** `950`, `12.0k`, `1.2M`. */
export function formatTokens(count: number): string {
  if (count >= MILLION) return `${(count / MILLION).toFixed(1)}M`;
  if (count >= THOUSAND) return `${(count / THOUSAND).toFixed(1)}k`;
  return String(count);
}

const ESCAPE_SEQUENCE =
  // eslint-disable-next-line no-control-regex
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[_P^][^\x1b]*\x1b\\|[_P^][^\x07]*\x07|.)/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\x00-\x08\x0b-\x1f\x7f]/g;
const TAB = /\t/g;
const TAB_AS_SPACES = '  ';

/**
 * Text from outside the console (agent logs, error messages) with every
 * escape sequence and control character removed, so it can never move the
 * cursor, change colours or ring the bell inside the console.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(ESCAPE_SEQUENCE, '')
    .replace(TAB, TAB_AS_SPACES)
    .replace(CONTROL_CHARACTER, '');
}

// eslint-disable-next-line no-control-regex
const STYLE_SEQUENCE = /\x1b\[[0-9;]*m/g;

/** The text without colour or style codes (truncation adds resets of its own). */
export function stripStyles(text: string): string {
  return text.replace(STYLE_SEQUENCE, '');
}

/** Exactly `width` columns: truncated with an ellipsis, or padded on the right. */
export function fit(text: string, width: number): string {
  if (width <= 0) return '';
  return truncateToWidth(text, width, ELLIPSIS, true);
}

/** Exactly `width` columns, right-aligned. */
export function fitRight(text: string, width: number): string {
  if (width <= 0) return '';
  const shown = truncateToWidth(text, width, ELLIPSIS);
  return ' '.repeat(Math.max(0, width - visibleWidth(shown))) + shown;
}

export interface StateStyle {
  symbol: string;
  paint: (text: string) => string;
}

/** How each feature state looks in the roster and the strip. */
export const STATE_STYLE: Record<FeatureState, StateStyle> = {
  [FeatureState.Running]: { symbol: '●', paint: colors.info },
  [FeatureState.ActionRequired]: { symbol: '◆', paint: colors.warning },
  [FeatureState.Blocked]: { symbol: '◌', paint: colors.warning },
  [FeatureState.Pending]: { symbol: '○', paint: colors.muted },
  [FeatureState.Queued]: { symbol: '◌', paint: colors.muted },
  [FeatureState.Done]: { symbol: '✓', paint: colors.success },
  [FeatureState.Error]: { symbol: '✗', paint: colors.error },
  [FeatureState.Deleting]: { symbol: '○', paint: colors.muted },
  [FeatureState.Archived]: { symbol: '○', paint: colors.muted },
};

/** A running feature with an open question looks like a gate, not like work. */
export const QUESTION_STYLE: StateStyle = { symbol: '?', paint: colors.warning };

export const paint = {
  title: (text: string) => pc.bold(colors.brand(text)),
  heading: (text: string) => pc.bold(text),
  label: colors.muted,
  key: (text: string) => pc.bold(colors.brand(text)),
  selected: pc.inverse,
  attention: (text: string) => pc.bold(colors.warning(text)),
  ok: colors.success,
  error: colors.error,
  muted: colors.muted,
  border: colors.muted,
} as const;
