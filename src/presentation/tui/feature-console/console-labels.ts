/**
 * Feature console labels (spec 142): how a row's state, phase and agent are
 * named and styled. Shared by the roster and the inspector.
 */

import type { TFunction } from 'i18next';
import { FeatureState } from '@/domain/generated/output.js';
import { getAgentDescriptor } from '@/domain/shared/agent-catalog.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import { NO_VALUE, QUESTION_STYLE, STATE_STYLE, type StateStyle } from './console-format.js';

export const NS = 'tui:console';
export const SEPARATOR = ' · ';

export function styleOf(row: FeatureConsoleRow): StateStyle {
  return row.needsAttention && row.state !== FeatureState.ActionRequired
    ? QUESTION_STYLE
    : STATE_STYLE[row.state];
}

export function stateLabel(row: FeatureConsoleRow, t: TFunction): string {
  return row.needsAttention && row.state !== FeatureState.ActionRequired
    ? t(`${NS}.state.question`)
    : t(`${NS}.state.${row.state}`);
}

export function phaseLabel(phase: string, t: TFunction): string {
  return t(`${NS}.phase.${phase}`, { defaultValue: phase });
}

export function agentLabel(row: FeatureConsoleRow): string {
  if (!row.agentType) return NO_VALUE;
  return getAgentDescriptor(row.agentType)?.label ?? row.agentType;
}
