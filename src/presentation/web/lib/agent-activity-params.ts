/**
 * Query-string parsing shared by the agent-activity routes (spec 148).
 */

import { AgentActivityState } from '@shepai/core/domain/generated/output';

const FLAG_ON_VALUES: ReadonlySet<string> = new Set(['1', 'true']);
const STATE_SEPARATOR = ',';
const ACTIVITY_STATES: ReadonlySet<string> = new Set(Object.values(AgentActivityState));

/** A trimmed, non-empty query parameter, or undefined. */
export function optionalParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  return value;
}

export function isFlagOn(value: string | null): boolean {
  return value !== null && FLAG_ON_VALUES.has(value.trim().toLowerCase());
}

export type ParsedActivityStates =
  | { ok: true; states?: AgentActivityState[] }
  | { ok: false; invalid: string };

/** `blocked,done` → the states; absent or empty → no states (the use case's default). */
export function parseActivityStates(value: string | null): ParsedActivityStates {
  const names = (value ?? '')
    .split(STATE_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return { ok: true };
  const invalid = names.find((name) => !ACTIVITY_STATES.has(name));
  if (invalid !== undefined) return { ok: false, invalid };
  return { ok: true, states: names as AgentActivityState[] };
}
