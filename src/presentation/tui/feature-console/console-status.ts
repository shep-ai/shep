/**
 * Feature console status line (specs 142, 143): the one line above the key
 * bar. A prompt or a confirmation wins, then progress, a refresh error, the
 * last action's result, and finally the active filter.
 */

import type { TFunction } from 'i18next';
import type { Input } from '@mariozechner/pi-tui';
import type { FeatureConsoleActionResult } from '@/application/use-cases/feature-console/feature-console.types.js';
import { paint, sanitizeText } from './console-format.js';
import { NS } from './console-labels.js';

export interface StatusLineState {
  /** A text prompt the user is typing into (reject feedback, filter). */
  prompt?: { label: string; input: Input };
  /** A yes/no question (stop). */
  confirm?: string;
  busy?: string;
  refreshError?: string;
  result?: FeatureConsoleActionResult;
  filter: { query: string; shown: number; total: number };
}

export function renderStatusLine(state: StatusLineState, t: TFunction, width: number): string {
  if (state.prompt) {
    const label = ` ${state.prompt.label} `;
    const [line] = state.prompt.input.render(Math.max(1, width - label.length));
    return paint.attention(label) + line;
  }
  if (state.confirm) return paint.attention(` ${state.confirm}`);
  if (state.busy) return paint.muted(` ${state.busy}`);
  if (state.refreshError) {
    return paint.error(
      ` ${t(`${NS}.refreshFailed`, { message: sanitizeText(state.refreshError) })}`
    );
  }
  if (state.result) {
    const message = sanitizeText(state.result.message);
    return state.result.ok ? paint.ok(` ✓ ${message}`) : paint.error(` ✗ ${message}`);
  }
  if (state.filter.query) {
    return paint.muted(` ${t(`${NS}.filter.active`, state.filter)}`);
  }
  return '';
}
