/**
 * Guardrail Rule Parsing
 *
 * The single place that turns `SupervisorPolicy.guardrailRulesJson` into
 * {@link GuardrailRule}s. Both the supervisor's deterministic pre-LLM pass and
 * `shep fleet approve --low-risk` judge gates against the same stored rules, so
 * "what counts as a valid rule" and "what does unreadable JSON mean" must have
 * exactly one definition.
 *
 * Unreadable configuration is `null`, never an empty list: callers treat it as
 * "cannot prove compliance" and fail closed. Silently dropping a broken rule
 * would disable a safety bound without anyone noticing.
 *
 * Note the import convention: relative imports inside `domain/` carry no file
 * extension, because the web package consumes this directory as raw TypeScript
 * source and its bundler cannot resolve a `.js` specifier pointing at a `.ts`
 * file.
 */

import { GuardrailGateType } from '../generated/output';
import type { GuardrailRule } from '../generated/output';

/** True when a LangGraph node name maps onto a guardrail-governed gate. */
export function isGuardrailGateType(value: string): value is GuardrailGateType {
  return (Object.values(GuardrailGateType) as string[]).includes(value);
}

/**
 * Parses {@link SupervisorPolicy.guardrailRulesJson}.
 *
 * Returns `null` — never an empty list — when the stored value is unreadable or
 * holds even one malformed rule. Callers treat `null` as "cannot prove
 * compliance".
 */
export function parseGuardrailRules(json: string | undefined): GuardrailRule[] | null {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed.every(isGuardrailRule) ? parsed : null;
  } catch {
    return null;
  }
}

function isGuardrailRule(value: unknown): value is GuardrailRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<GuardrailRule>;
  return (
    typeof rule.id === 'string' &&
    rule.id.trim().length > 0 &&
    typeof rule.gate === 'string' &&
    isGuardrailGateType(rule.gate) &&
    typeof rule.autoApprove === 'boolean'
  );
}
