/**
 * Evaluate Gate Guardrails Use Case
 *
 * Deterministically checks approval gate candidates against configured GuardrailRules.
 * If every applicable criteria passes and each matching rule allows auto-approval, the
 * gate is approved without human hand-holding. Otherwise it escalates with structured
 * violation details.
 *
 * Evaluation is **conjunctive**: every rule that applies to the gate must pass. A rule
 * never short-circuits the evaluation of a later rule, so adding a stricter rule can
 * only ever make the outcome safer.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Independent of external SDKs or infrastructure
 * - Cross-platform path normalization (Windows & Unix)
 */

import { injectable } from 'tsyringe';
import {
  type GuardrailRule,
  GuardrailGateType,
  type GuardrailEvaluationResult,
} from '../../../domain/generated/output.js';

export interface EvaluateGateGuardrailsInput {
  gate: GuardrailGateType;
  diffLines?: number;
  filesChanged?: number;
  modifiedFiles?: string[];
  ciPassed?: boolean;
  rules: GuardrailRule[];
}

/**
 * Converts a simple glob pattern (supporting `*`, `**`, `?`) into a RegExp.
 * Normalizes all path separators to forward slashes.
 *
 * `*` matches within a path segment, `**` crosses segments, and the whole
 * pattern is anchored to path-segment boundaries so `auth/**` cannot match
 * `myauth/thing.ts`.
 */
function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  const escaped = normalized
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, '§§DOUBLE_STAR§§')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/§§DOUBLE_STAR§§/g, '.*');
  return new RegExp(`(^|/)${escaped}($|/)`);
}

/**
 * Collects every way the given rule is violated by the supplied gate metrics.
 * An empty array means the rule passed.
 */
function collectViolations(rule: GuardrailRule, input: EvaluateGateGuardrailsInput): string[] {
  const { diffLines = 0, filesChanged = 0, modifiedFiles = [], ciPassed } = input;
  const violations: string[] = [];

  if (rule.maxDiffLines !== undefined && diffLines > rule.maxDiffLines) {
    violations.push(`Diff lines (${diffLines}) exceed maximum permitted (${rule.maxDiffLines})`);
  }

  if (rule.maxFilesChanged !== undefined && filesChanged > rule.maxFilesChanged) {
    violations.push(
      `Files changed (${filesChanged}) exceed maximum permitted (${rule.maxFilesChanged})`
    );
  }

  if (rule.requireCiPass === true && ciPassed !== true) {
    violations.push('CI pipeline must be passing but is failing or incomplete');
  }

  if (rule.blockedPathPatterns && rule.blockedPathPatterns.length > 0) {
    const regexes = rule.blockedPathPatterns.map(globToRegExp);
    const normalizedFiles = modifiedFiles.map((f) => f.replace(/\\/g, '/'));

    for (const file of normalizedFiles) {
      for (let i = 0; i < regexes.length; i++) {
        if (regexes[i].test(file)) {
          violations.push(
            `Modified file '${file}' matches blocked sensitive path pattern '${rule.blockedPathPatterns[i]}'`
          );
          break;
        }
      }
    }
  }

  return violations;
}

@injectable()
export class EvaluateGateGuardrailsUseCase {
  /**
   * Evaluates input metrics against matching guardrail rules.
   */
  execute(input: EvaluateGateGuardrailsInput): GuardrailEvaluationResult {
    const { gate, diffLines = 0, rules } = input;

    // Rules targeting this specific gate, plus rules that apply to every gate.
    const matchingRules = rules.filter((r) => r.gate === gate || r.gate === GuardrailGateType.all);

    if (matchingRules.length === 0) {
      return {
        passed: true,
        autoApproved: false,
        violations: [],
        rationale:
          'No matching guardrail rules configured for this gate. Escalating for manual review.',
      };
    }

    // Evaluate every matching rule. A single breaching rule blocks auto-approval,
    // so rule order must never change the verdict.
    const violations: string[] = [];
    let firstBreachingRuleId: string | undefined;

    for (const rule of matchingRules) {
      const ruleViolations = collectViolations(rule, input);
      if (ruleViolations.length > 0) {
        firstBreachingRuleId ??= rule.id;
        violations.push(...ruleViolations);
      }
    }

    if (violations.length > 0) {
      return {
        passed: false,
        autoApproved: false,
        ruleId: firstBreachingRuleId,
        violations,
        rationale: `Guardrail check failed: ${violations.join('; ')}`,
      };
    }

    // Every matching rule passed. Auto-approval additionally requires that no
    // matching rule opted out of it — one "advise only" rule keeps a human in
    // the loop even when a looser rule would have approved.
    const blockingRule = matchingRules.find((rule) => !rule.autoApprove);
    const singleRuleId = matchingRules.length === 1 ? matchingRules[0].id : undefined;

    if (blockingRule) {
      return {
        passed: true,
        autoApproved: false,
        ruleId: blockingRule.id,
        violations: [],
        rationale: `All ${matchingRules.length} matching guardrail rule(s) passed, but rule '${blockingRule.id}' requires manual confirmation.`,
      };
    }

    return {
      passed: true,
      autoApproved: true,
      ...(singleRuleId ? { ruleId: singleRuleId } : {}),
      violations: [],
      rationale:
        matchingRules.length === 1
          ? `Auto-approved by guardrail rule '${singleRuleId}': diff (${diffLines} lines) and CI are within safety bounds.`
          : `Auto-approved by ${matchingRules.length} guardrail rules (${matchingRules.map((r) => r.id).join(', ')}): diff (${diffLines} lines) and CI are within safety bounds.`,
    };
  }
}
