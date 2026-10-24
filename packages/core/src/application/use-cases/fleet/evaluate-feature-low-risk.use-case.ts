/**
 * Evaluate Feature Low Risk Use Case
 *
 * Answers one question for `shep fleet approve --low-risk`: is this waiting gate
 * provably within the configured guardrails, and does every matching rule permit
 * an automatic approval?
 *
 * The answer is a filter, never an approval — the batch use case decides what to
 * do with it, so this use case cannot approve anything by itself.
 *
 * Fail-closed rules, in order:
 *  - the feature no longer exists;
 *  - no supervisor policy exists for its scope, or the policy is disabled;
 *  - the stored rules are unreadable;
 *  - no rule targets this gate;
 *  - the diff/CI facts cannot be established.
 *
 * **No rules means no approvals.** With guardrails unconfigured the evaluator
 * returns `passed: true, autoApproved: false`; only `autoApproved` may be read as
 * "low-risk". Approving on `passed` would make `--low-risk` a synonym for
 * `--all`, which is the one thing it must never become.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Ports: IFeatureRepository, IApplicationRepository
 */

import { injectable, inject } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import { GetSupervisorPolicyUseCase } from '../agents/get-supervisor-policy.use-case.js';
import { CollectGateMetricsUseCase } from './collect-gate-metrics.use-case.js';
import { EvaluateGateGuardrailsUseCase } from './evaluate-gate-guardrails.use-case.js';
import { parseGuardrailRules } from '../../../domain/shared/guardrail-rules.js';
import {
  GuardrailGateType,
  SupervisorScopeType,
  type Feature,
} from '../../../domain/generated/output.js';

export interface EvaluateFeatureLowRiskInput {
  featureId: string;
  gate: GuardrailGateType;
}

export interface FeatureLowRiskAssessment {
  /** True only when every matching rule passed AND permits auto-approval. */
  lowRisk: boolean;
  /** Why, in the operator's terms. Always populated — skips are explained. */
  reason: string;
  /** The rule that decided an approval, when one is attributable. */
  ruleId?: string;
}

@injectable()
export class EvaluateFeatureLowRiskUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject(GetSupervisorPolicyUseCase)
    private readonly getPolicy: GetSupervisorPolicyUseCase,
    @inject(CollectGateMetricsUseCase)
    private readonly collectMetrics: CollectGateMetricsUseCase,
    @inject(EvaluateGateGuardrailsUseCase)
    private readonly evaluateGuardrails: EvaluateGateGuardrailsUseCase
  ) {}

  async execute(input: EvaluateFeatureLowRiskInput): Promise<FeatureLowRiskAssessment> {
    const feature = await this.featureRepo.findById(input.featureId);
    if (!feature) {
      return {
        lowRisk: false,
        reason: `Feature ${input.featureId} not found — not provably low-risk`,
      };
    }

    const { scopeType, scopeId } = await this.resolveScope(feature);
    const policy = await this.getPolicy.execute({ scopeType, scopeId, featureId: feature.id });

    if (!policy) {
      return {
        lowRisk: false,
        reason:
          'No guardrail rules configured — no supervisor policy exists for this scope, so nothing is low-risk',
      };
    }

    if (policy.enabled === false) {
      // A disabled policy must not act, and `--low-risk` acts on its rules.
      return {
        lowRisk: false,
        reason:
          'No guardrail rules configured — the supervisor policy is disabled, so nothing is low-risk',
      };
    }

    const rules = parseGuardrailRules(policy.guardrailRulesJson);
    if (rules === null) {
      return {
        lowRisk: false,
        reason: 'Stored guardrail rules are unreadable — not provably low-risk',
      };
    }

    const matchingRules = rules.filter(
      (rule) => rule.gate === input.gate || rule.gate === GuardrailGateType.all
    );
    if (matchingRules.length === 0) {
      return {
        lowRisk: false,
        reason: `No guardrail rules configured for the ${input.gate} gate — nothing is low-risk`,
      };
    }

    const metrics = await this.collectMetrics.execute({
      featureId: feature.id,
      repositoryPath: feature.repositoryPath,
    });
    if (!metrics) {
      return {
        lowRisk: false,
        reason: 'Cannot establish the diff and CI metrics — not provably low-risk',
      };
    }

    const evaluation = this.evaluateGuardrails.execute({
      gate: input.gate,
      ...metrics,
      rules,
    });

    return {
      lowRisk: evaluation.autoApproved,
      reason: evaluation.rationale,
      ...(evaluation.ruleId ? { ruleId: evaluation.ruleId } : {}),
    };
  }

  /**
   * Resolves the policy scope for a feature the same way the supervisor gate
   * evaluator does: the feature's application when known, else the application
   * that owns its repository path, else a repository scope.
   */
  private async resolveScope(
    feature: Feature
  ): Promise<{ scopeType: SupervisorScopeType; scopeId: string }> {
    if (feature.applicationId) {
      return { scopeType: SupervisorScopeType.app, scopeId: feature.applicationId };
    }
    try {
      const app = await this.applicationRepo.findByPath(feature.repositoryPath);
      if (app?.id) return { scopeType: SupervisorScopeType.app, scopeId: app.id };
    } catch {
      // Fall through to repo-based scope.
    }
    return { scopeType: SupervisorScopeType.repo, scopeId: feature.repositoryPath };
  }
}
