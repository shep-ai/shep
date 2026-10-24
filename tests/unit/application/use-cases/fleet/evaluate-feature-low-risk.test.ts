/**
 * EvaluateFeatureLowRiskUseCase Unit Tests
 *
 * `shep fleet approve --low-risk` asks this use case one question per candidate:
 * is this gate provably within the configured guardrails, and does every
 * matching rule permit an automatic approval?
 *
 * The decision that matters most: **no rules means no approvals**. Approving
 * everything when nothing is configured would make `--low-risk` a synonym for
 * `--all`.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvaluateFeatureLowRiskUseCase } from '@/application/use-cases/fleet/evaluate-feature-low-risk.use-case.js';
import { EvaluateGateGuardrailsUseCase } from '@/application/use-cases/fleet/evaluate-gate-guardrails.use-case.js';
import {
  GuardrailGateType,
  type GuardrailRule,
  type SupervisorPolicy,
} from '@/domain/generated/output.js';

const planRule: GuardrailRule = {
  id: 'safe-plan',
  gate: GuardrailGateType.plan,
  maxDiffLines: 200,
  maxFilesChanged: 5,
  blockedPathPatterns: ['**/auth/**'],
  requireCiPass: false,
  autoApprove: true,
};

const metrics = {
  diffLines: 40,
  filesChanged: 2,
  modifiedFiles: ['src/a.ts', 'src/b.ts'],
  ciPassed: true,
};

function policyWith(rules: GuardrailRule[] | string | undefined): SupervisorPolicy {
  return {
    id: 'policy-1',
    scopeType: 'app',
    scopeId: 'app-1',
    autonomyLevel: 'advisory',
    enabled: true,
    ...(rules === undefined
      ? {}
      : { guardrailRulesJson: typeof rules === 'string' ? rules : JSON.stringify(rules) }),
  } as SupervisorPolicy;
}

describe('EvaluateFeatureLowRiskUseCase', () => {
  let featureRepo: { findById: ReturnType<typeof vi.fn> };
  let applicationRepo: { findByPath: ReturnType<typeof vi.fn> };
  let getPolicy: { execute: ReturnType<typeof vi.fn> };
  let collectMetrics: { execute: ReturnType<typeof vi.fn> };
  let useCase: EvaluateFeatureLowRiskUseCase;

  beforeEach(() => {
    featureRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'f1',
        applicationId: 'app-1',
        repositoryPath: '/repo',
        worktreePath: '/wt/feat-1',
      }),
    };
    applicationRepo = { findByPath: vi.fn().mockResolvedValue({ id: 'app-1' }) };
    getPolicy = { execute: vi.fn().mockResolvedValue(policyWith([planRule])) };
    collectMetrics = { execute: vi.fn().mockResolvedValue(metrics) };

    useCase = new EvaluateFeatureLowRiskUseCase(
      featureRepo as never,
      applicationRepo as never,
      getPolicy as never,
      collectMetrics as never,
      new EvaluateGateGuardrailsUseCase()
    );
  });

  it('marks a gate low-risk when every matching rule passes and permits approval', async () => {
    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(true);
    expect(assessment.ruleId).toBe('safe-plan');
    expect(assessment.reason).toContain('Auto-approved');
  });

  it('approves nothing when no guardrail rules are configured', async () => {
    // The decision, pinned: unconfigured guardrails must not silently approve
    // every gate the way `--all` would.
    getPolicy.execute.mockResolvedValue(policyWith(undefined));

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/no guardrail rules/i);
  });

  it('approves nothing when the install has no supervisor policy at all', async () => {
    getPolicy.execute.mockResolvedValue(null);

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/no guardrail rules/i);
  });

  it('approves nothing when the supervisor policy is disabled', async () => {
    // A disabled policy must not act, and --low-risk acts on its rules.
    getPolicy.execute.mockResolvedValue({ ...policyWith([planRule]), enabled: false });

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/disabled/i);
    expect(collectMetrics.execute).not.toHaveBeenCalled();
  });

  it('approves nothing when every rule targets a different gate', async () => {
    getPolicy.execute.mockResolvedValue(
      policyWith([{ ...planRule, gate: GuardrailGateType.merge }])
    );

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/no guardrail rules/i);
  });

  it('fails closed when the stored rules are unreadable', async () => {
    getPolicy.execute.mockResolvedValue(policyWith('{not json'));

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/unreadable/i);
  });

  it('escalates a gate that breaches a rule', async () => {
    collectMetrics.execute.mockResolvedValue({ ...metrics, diffLines: 900 });

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toContain('900');
    expect(assessment.reason).toContain('exceed maximum permitted');
  });

  it('escalates a gate that touches a blocked path', async () => {
    collectMetrics.execute.mockResolvedValue({
      ...metrics,
      modifiedFiles: ['src/auth/session.ts'],
    });

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toContain('src/auth/session.ts');
  });

  it('never approves when the matching rule is advise-only', async () => {
    getPolicy.execute.mockResolvedValue(policyWith([{ ...planRule, autoApprove: false }]));

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toContain('manual confirmation');
  });

  it('escalates when the diff or CI facts cannot be established', async () => {
    collectMetrics.execute.mockResolvedValue(undefined);

    const assessment = await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/cannot establish|could not establish/i);
  });

  it('escalates when the feature no longer exists', async () => {
    featureRepo.findById.mockResolvedValue(null);

    const assessment = await useCase.execute({ featureId: 'gone', gate: GuardrailGateType.plan });

    expect(assessment.lowRisk).toBe(false);
    expect(assessment.reason).toMatch(/not found/i);
    expect(collectMetrics.execute).not.toHaveBeenCalled();
  });

  it('resolves the policy for the feature, feature-over-scope fallback included', async () => {
    await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(getPolicy.execute).toHaveBeenCalledWith({
      scopeType: 'app',
      scopeId: 'app-1',
      featureId: 'f1',
    });
  });

  it('falls back to a repository scope when the feature has no application', async () => {
    featureRepo.findById.mockResolvedValue({
      id: 'f1',
      repositoryPath: '/repo/alpha',
      worktreePath: '/wt/feat-1',
    });
    applicationRepo.findByPath.mockResolvedValue(null);

    await useCase.execute({ featureId: 'f1', gate: GuardrailGateType.plan });

    expect(getPolicy.execute).toHaveBeenCalledWith({
      scopeType: 'repo',
      scopeId: '/repo/alpha',
      featureId: 'f1',
    });
  });
});
