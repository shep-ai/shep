/**
 * Status segment (spec 146): one line saying how many features need the user
 * and what is running or failed, for tmux's status-right, prompts and other
 * status bars.
 */

import type { TFunction } from 'i18next';
import { FeatureState } from '@/domain/generated/output.js';
import type { FeatureConsoleSummary } from '@/application/use-cases/feature-console/feature-console.types.js';
import { STATE_STYLE } from './console-format.js';
import { NS, SEPARATOR } from './console-labels.js';

export enum StatusSegmentStyle {
  Plain = 'plain',
  Tmux = 'tmux',
}

/** tmux user options the console publishes (`#{@shep_status}` in status-right). */
export const TMUX_STATUS_OPTION = '@shep_status';
export const TMUX_NEEDS_YOU_OPTION = '@shep_needs_you';

const TMUX_RESET = '#[default]';
const TMUX_STYLE = {
  attention: '#[fg=yellow,bold]',
  quiet: '#[fg=colour244]',
  running: '#[fg=cyan]',
  failed: '#[fg=red]',
} as const;

interface Part {
  text: string;
  tmuxStyle: string;
}

function parts(summary: FeatureConsoleSummary, t: TFunction): Part[] {
  const label = (key: string) => t(`${NS}.summary.${key}`);
  const needsYou: Part = {
    text: `${STATE_STYLE[FeatureState.ActionRequired].symbol} ${summary.needsAttention} ${label('needsYou')}`,
    tmuxStyle: summary.needsAttention > 0 ? TMUX_STYLE.attention : TMUX_STYLE.quiet,
  };
  const optional: (Part | undefined)[] = [
    summary.running > 0
      ? {
          text: `${STATE_STYLE[FeatureState.Running].symbol} ${summary.running} ${label('running')}`,
          tmuxStyle: TMUX_STYLE.running,
        }
      : undefined,
    summary.failed > 0
      ? {
          text: `${STATE_STYLE[FeatureState.Error].symbol} ${summary.failed} ${label('failed')}`,
          tmuxStyle: TMUX_STYLE.failed,
        }
      : undefined,
  ];
  return [needsYou, ...optional.filter((p): p is Part => p !== undefined)];
}

export function formatStatusSegment(
  summary: FeatureConsoleSummary,
  t: TFunction,
  style: StatusSegmentStyle
): string {
  return parts(summary, t)
    .map((p) =>
      style === StatusSegmentStyle.Tmux ? `${p.tmuxStyle}${p.text}${TMUX_RESET}` : p.text
    )
    .join(SEPARATOR);
}

/** What the console publishes to tmux on each change. */
export function tmuxStatusOptions(
  summary: FeatureConsoleSummary,
  t: TFunction
): Record<string, string> {
  return {
    [TMUX_STATUS_OPTION]: formatStatusSegment(summary, t, StatusSegmentStyle.Tmux),
    [TMUX_NEEDS_YOU_OPTION]: String(summary.needsAttention),
  };
}
