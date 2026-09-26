/**
 * Agent effort parsing.
 *
 * Effort crosses several untyped boundaries: a CLI argument, a server-action
 * payload, the feature worker's argv and a SQLite column. Every one of them
 * funnels through `parseAgentEffort`, so a value that is not an `AgentEffort`
 * never reaches the agent CLI. An unrecognized value reads as "unset" (the
 * agent's own default) instead of throwing, which keeps a stale or hand-edited
 * database row from breaking a feature run.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript
// through Turbopack, which does not map .js back to .ts.
import { AgentEffort } from '../generated/output';

/** Every effort level, ordered from least to most reasoning. */
export const AGENT_EFFORT_LEVELS: readonly AgentEffort[] = [
  AgentEffort.low,
  AgentEffort.medium,
  AgentEffort.high,
  AgentEffort.xhigh,
  AgentEffort.max,
];

const EFFORT_VALUES = new Set<string>(AGENT_EFFORT_LEVELS);

/**
 * Coerce a raw string into an `AgentEffort`, or `undefined` when it is absent
 * or not a known level. Case and surrounding whitespace are ignored.
 */
export function parseAgentEffort(value: string | null | undefined): AgentEffort | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  return EFFORT_VALUES.has(key) ? (key as AgentEffort) : undefined;
}

/**
 * Spread helper for optional effort fields: `{ effort }` when the value is a
 * known level, `{}` otherwise. Every place that pins or forwards effort (agent
 * run creation, worker spawn, resume paths, executor options) uses it, so an
 * unset or invalid value is never written as `effort: undefined` or passed on.
 */
export function effortField(value: string | null | undefined): { effort?: AgentEffort } {
  const effort = parseAgentEffort(value);
  return effort ? { effort } : {};
}
