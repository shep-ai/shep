/**
 * Permission precedence (spec 119, docs/06 and spec/state-machines/permission.md).
 *
 * Deterministic policy decides. deny > ask > allow. A user grant can turn an
 * `ask` into `allow`, never a `deny` into anything else. AI judgment never
 * changes the effect in V0 (it is recorded in shadow only).
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { PermissionEffect } from '../generated/output';

export interface RuleMatch {
  ruleId: string;
  effect: PermissionEffect;
  hard: boolean;
}

export interface PolicyOutcome {
  effect: PermissionEffect;
  /** A matched hard rule decided the outcome: never approvable. */
  hard: boolean;
  matchedRuleIds: string[];
}

const STRENGTH: Record<PermissionEffect, number> = {
  [PermissionEffect.Allow]: 0,
  [PermissionEffect.Ask]: 1,
  [PermissionEffect.Deny]: 2,
};

export function combineRuleEffects(
  matches: readonly RuleMatch[],
  defaultUnknown: PermissionEffect
): PolicyOutcome {
  if (matches.length === 0) {
    return { effect: defaultUnknown, hard: false, matchedRuleIds: [] };
  }
  const strongest = matches.reduce((a, b) => (STRENGTH[b.effect] > STRENGTH[a.effect] ? b : a));
  const hard = matches.some((m) => m.hard && m.effect === strongest.effect);
  return {
    effect: strongest.effect,
    hard,
    matchedRuleIds: matches.map((m) => m.ruleId),
  };
}

/** A matching grant only ever lifts `ask`. */
export function applyGrant(outcome: PolicyOutcome, grantMatches: boolean): PermissionEffect {
  if (grantMatches && outcome.effect === PermissionEffect.Ask) return PermissionEffect.Allow;
  return outcome.effect;
}

/** When nobody can answer, `ask` resolves to the configured non-interactive effect. */
export function resolveAsk(
  effect: PermissionEffect,
  interactive: boolean,
  nonInteractiveAsk: PermissionEffect
): PermissionEffect {
  if (effect === PermissionEffect.Ask && !interactive) return nonInteractiveAsk;
  return effect;
}
