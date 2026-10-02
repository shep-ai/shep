/**
 * EvaluateGateGuardrailsUseCase Unit Tests
 *
 * Validates deterministic criteria evaluation for auto-approval and escalation
 * across diff thresholds, CI status, and sensitive path patterns.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { EvaluateGateGuardrailsUseCase } from '@/application/use-cases/fleet/evaluate-gate-guardrails.use-case.js';
import { GuardrailGateType, type GuardrailRule } from '@/domain/generated/output.js';

describe('EvaluateGateGuardrailsUseCase', () => {
  let useCase: EvaluateGateGuardrailsUseCase;

  beforeEach(() => {
    useCase = new EvaluateGateGuardrailsUseCase();
  });

  it('should auto-approve when all criteria are satisfied and autoApprove is true', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-low-risk-merge',
        gate: GuardrailGateType.merge,
        maxDiffLines: 250,
        maxFilesChanged: 5,
        blockedPathPatterns: ['**/auth/**', '**/billing/**'],
        requireCiPass: true,
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      diffLines: 120,
      filesChanged: 3,
      modifiedFiles: ['src/components/button.tsx', 'src/styles.css'],
      ciPassed: true,
      rules,
    });

    expect(result.passed).toBe(true);
    expect(result.autoApproved).toBe(true);
    expect(result.ruleId).toBe('rule-low-risk-merge');
    expect(result.violations).toHaveLength(0);
    expect(result.rationale).toContain('Auto-approved by guardrail rule');
  });

  it('should fail and escalate when diffLines exceed the maximum limit', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-plan-strict',
        gate: GuardrailGateType.plan,
        maxDiffLines: 100,
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.plan,
      diffLines: 215,
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.autoApproved).toBe(false);
    expect(result.violations).toContain('Diff lines (215) exceed maximum permitted (100)');
  });

  it('should fail and escalate when filesChanged exceed the maximum limit', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-files-limit',
        gate: GuardrailGateType.prd,
        maxFilesChanged: 4,
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.prd,
      filesChanged: 8,
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.autoApproved).toBe(false);
    expect(result.violations).toContain('Files changed (8) exceed maximum permitted (4)');
  });

  it('should fail when requireCiPass is true and CI did not pass', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-ci-check',
        gate: GuardrailGateType.merge,
        requireCiPass: true,
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      ciPassed: false,
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.autoApproved).toBe(false);
    expect(result.violations).toContain('CI pipeline must be passing but is failing or incomplete');
  });

  it('should fail and block auto-approval when a modified file matches a sensitive path pattern', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-safe-paths',
        gate: GuardrailGateType.all,
        blockedPathPatterns: ['**/auth/**', '**/migrations/**', 'package.json'],
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.plan,
      modifiedFiles: ['packages/core/src/domain/user.ts', 'packages/core/src/auth/session.ts'],
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.autoApproved).toBe(false);
    expect(result.violations[0]).toContain("matches blocked sensitive path pattern '**/auth/**'");
  });

  it('should normalize Windows backslash paths when matching blocked path patterns', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-win-paths',
        gate: GuardrailGateType.all,
        blockedPathPatterns: ['**/billing/**'],
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      modifiedFiles: ['src\\services\\billing\\stripe.service.ts'],
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain(
      "matches blocked sensitive path pattern '**/billing/**'"
    );
  });

  it('should return manual review notice when no matching rules are configured for the gate', () => {
    const rules: GuardrailRule[] = [
      {
        id: 'rule-merge-only',
        gate: GuardrailGateType.merge,
        autoApprove: true,
      },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.prd,
      rules,
    });

    expect(result.passed).toBe(true);
    expect(result.autoApproved).toBe(false);
    expect(result.rationale).toContain('No matching guardrail rules configured');
  });

  it('should not let a permissive rule bypass a stricter gate-wide rule (order independence)', () => {
    const permissive: GuardrailRule = {
      id: 'rule-permissive-merge',
      gate: GuardrailGateType.merge,
      autoApprove: true,
    };
    const sensitive: GuardrailRule = {
      id: 'rule-sensitive-paths',
      gate: GuardrailGateType.all,
      blockedPathPatterns: ['**/auth/**'],
      autoApprove: true,
    };

    const input = {
      gate: GuardrailGateType.merge,
      modifiedFiles: ['packages/core/src/auth/session.ts'],
      rules: [] as GuardrailRule[],
    };

    const permissiveFirst = useCase.execute({ ...input, rules: [permissive, sensitive] });
    const sensitiveFirst = useCase.execute({ ...input, rules: [sensitive, permissive] });

    for (const result of [permissiveFirst, sensitiveFirst]) {
      expect(result.passed).toBe(false);
      expect(result.autoApproved).toBe(false);
      expect(result.violations[0]).toContain("matches blocked sensitive path pattern '**/auth/**'");
    }
  });

  it('should report the violations of every failing rule, not just the first', () => {
    const rules: GuardrailRule[] = [
      { id: 'rule-diff', gate: GuardrailGateType.all, maxDiffLines: 10, autoApprove: true },
      { id: 'rule-ci', gate: GuardrailGateType.all, requireCiPass: true, autoApprove: true },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      diffLines: 400,
      ciPassed: false,
      rules,
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([
      'Diff lines (400) exceed maximum permitted (10)',
      'CI pipeline must be passing but is failing or incomplete',
    ]);
  });

  it('should keep a human in the loop when any matching rule opts out of auto-approval', () => {
    const rules: GuardrailRule[] = [
      { id: 'rule-lenient', gate: GuardrailGateType.merge, maxDiffLines: 500, autoApprove: true },
      { id: 'rule-advise-only', gate: GuardrailGateType.all, autoApprove: false },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      diffLines: 20,
      rules,
    });

    expect(result.passed).toBe(true);
    expect(result.autoApproved).toBe(false);
    expect(result.ruleId).toBe('rule-advise-only');
    expect(result.rationale).toContain('requires manual confirmation');
  });

  it('should auto-approve when several matching rules all permit it', () => {
    const rules: GuardrailRule[] = [
      { id: 'rule-diff', gate: GuardrailGateType.all, maxDiffLines: 500, autoApprove: true },
      { id: 'rule-merge', gate: GuardrailGateType.merge, requireCiPass: true, autoApprove: true },
    ];

    const result = useCase.execute({
      gate: GuardrailGateType.merge,
      diffLines: 20,
      ciPassed: true,
      rules,
    });

    expect(result.passed).toBe(true);
    expect(result.autoApproved).toBe(true);
    expect(result.ruleId).toBeUndefined();
    expect(result.rationale).toContain('rule-diff, rule-merge');
  });
});
