/**
 * FeatureAgentSupervisorGateEvaluator
 *
 * Bridges the feature-agent worker's `waiting_approval` transition with
 * the {@link EvaluateSupervisorDecisionUseCase} (spec 093, task 29).
 *
 * On every approval-gate interrupt the worker calls
 * {@link evaluateForGate}. The evaluator:
 *
 *  1. Resolves the configured {@link SupervisorPolicy} for the
 *     (scopeType, scopeId, featureId) scope. When no policy is configured the call
 *     is a no-op — pure additive behaviour preserves the existing
 *     human-only path (NFR-14).
 *  2. Computes the effective per-gate autonomy: a `gateAuthorityJson`
 *     entry overrides the policy's default `autonomyLevel`.
 *  3. Calls {@link EvaluateSupervisorDecisionUseCase} which writes the
 *     {@link SupervisorDecision} row and mirrors it to the audit log.
 *  4. In **autonomous** mode for the gate AND when the supervisor's
 *     verdict is `approve` / `reject`, invokes
 *     {@link ApproveAgentRunUseCase} or {@link RejectAgentRunUseCase}
 *     with `actor = supervisor:<supervisorRunId>` so the existing gate
 *     state machine resolves the gate without further human action.
 *  5. In **advisory** and **co-sign** modes the decision is recorded
 *     but the gate stays in `waiting_approval`. The user still drives
 *     the resolution (user always wins). Co-sign awaits both votes by
 *     leaving the gate open for the user — the supervisor's vote is
 *     visible via `activity_log` but does not auto-close.
 *
 * Failures inside the evaluator MUST NOT crash the worker: the gate
 * already transitioned to `waiting_approval` before this hook runs, so
 * a swallowed error degrades to today's user-only flow (FR-22 fail
 * safe).
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { EvaluateSupervisorDecisionUseCase } from '@/application/use-cases/agents/evaluate-supervisor-decision.use-case.js';
import { GetSupervisorPolicyUseCase } from '@/application/use-cases/agents/get-supervisor-policy.use-case.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { EvaluateGateGuardrailsUseCase } from '@/application/use-cases/fleet/evaluate-gate-guardrails.use-case.js';
import {
  CiStatus,
  GuardrailGateType,
  SupervisorAutonomy,
  SupervisorVerdict,
  type GuardrailRule,
  type SupervisorPolicy,
} from '@/domain/generated/output.js';
import { supervisorActor } from '@/domain/value-objects/supervisor-actor.js';

const DEFAULT_GATE_ID = 'gate';

export interface SupervisorGateEvaluationInput {
  /** Agent run that hit the gate. */
  runId: string;
  /** Feature owning the run. */
  featureId: string;
  /** Repository path used to resolve the App scope. */
  repositoryPath: string;
  /** LangGraph node name that triggered the interrupt (e.g. `prd`, `plan`, `merge`). */
  interruptNode?: string;
}

export interface SupervisorGateEvaluationResult {
  /** True when an evaluation actually ran (flag on + policy found). */
  evaluated: boolean;
  /** Effective autonomy level for the gate (only set when evaluated). */
  effectiveAutonomy?: SupervisorAutonomy;
  /** The supervisor's verdict (only set when evaluated). */
  verdict?: SupervisorVerdict;
  /** True when the supervisor auto-resolved the gate in autonomous mode. */
  autoResolved: boolean;
  /**
   * Set when deterministic guardrails decided the outcome before the LLM
   * evaluator was consulted (spec 111).
   */
  guardrailVerdict?: GuardrailVerdict;
  /** The rule responsible for an auto-approval, when one is attributable. */
  guardrailRuleId?: string;
}

/** How the deterministic guardrail pass resolved, when it applied. */
export type GuardrailVerdict = 'auto_approved' | 'escalated';

@injectable()
export class FeatureAgentSupervisorGateEvaluator {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject(GetSupervisorPolicyUseCase)
    private readonly getPolicy: GetSupervisorPolicyUseCase,
    @inject(EvaluateSupervisorDecisionUseCase)
    private readonly evaluateDecision: EvaluateSupervisorDecisionUseCase,
    @inject(ApproveAgentRunUseCase)
    private readonly approveAgentRun: ApproveAgentRunUseCase,
    @inject(RejectAgentRunUseCase)
    private readonly rejectAgentRun: RejectAgentRunUseCase,
    @inject(EvaluateGateGuardrailsUseCase)
    private readonly evaluateGuardrails: EvaluateGateGuardrailsUseCase,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository
  ) {}

  async evaluateForGate(
    input: SupervisorGateEvaluationInput
  ): Promise<SupervisorGateEvaluationResult> {
    try {
      const { scopeType, scopeId } = await this.resolveScope(input.repositoryPath);
      const policy = await this.getPolicy.execute({
        scopeType,
        scopeId,
        featureId: input.featureId,
      });
      if (!policy) {
        // No supervisor configured for this scope. The flag-off short
        // circuit further down inside EvaluateSupervisorDecisionUseCase
        // still applies, but exiting here avoids generating a
        // supervisorRunId and a sourceEventId we don't need.
        return { evaluated: false, autoResolved: false };
      }

      const gateId = input.interruptNode ?? DEFAULT_GATE_ID;
      const supervisorRunId = randomUUID();
      const sourceEventId = `gate:${input.runId}:${gateId}`;

      // Deterministic guardrails run before the LLM. `undefined` means the
      // policy has no applicable rules and the LLM path below proceeds
      // unchanged; anything else is terminal (spec 111, Pillar 2).
      const guardrailOutcome = await this.applyGuardrails(policy, input, gateId, supervisorRunId);
      if (guardrailOutcome) {
        return guardrailOutcome;
      }

      const result = await this.evaluateDecision.execute({
        event: {
          kind: 'gate',
          scopeType,
          scopeId,
          featureId: input.featureId,
          agentRunId: input.runId,
          gateId,
          sourceEventId,
        },
        supervisorRunId,
      });

      if (!result.evaluated || !result.decision) {
        return { evaluated: false, autoResolved: false };
      }

      const effectiveAutonomy = resolveEffectiveAutonomy(policy, gateId);
      const verdict = result.decision.verdict;

      const autoResolved =
        effectiveAutonomy === SupervisorAutonomy.autonomous &&
        (await this.applyAutonomousVerdict(input.runId, verdict, supervisorRunId));

      return {
        evaluated: true,
        effectiveAutonomy,
        verdict,
        autoResolved,
      };
    } catch {
      // Supervisor errors must not block the gate — fall back to the
      // existing human-only path (FR-22).
      return { evaluated: false, autoResolved: false };
    }
  }

  /**
   * Evaluates the policy's deterministic guardrail rules (spec 111, Pillar 2).
   *
   * Returns `undefined` when guardrails are unconfigured, do not apply to this
   * gate, or merely advise — the caller then reaches the LLM evaluator exactly
   * as it did before this hook existed, which keeps the no-rules path
   * byte-identical.
   *
   * Anything else is terminal:
   *  - every matching rule passes and permits auto-approval → the gate is
   *    closed through the same actor-namespaced use case the autonomous LLM
   *    path uses, without spending an LLM call;
   *  - a rule is breached, the stored rules are unreadable, or the metrics
   *    needed to prove compliance cannot be gathered → the gate is left open
   *    for a human. The LLM is deliberately not consulted, because a
   *    deterministic breach must never be overridden by a model verdict.
   */
  private async applyGuardrails(
    policy: SupervisorPolicy,
    input: SupervisorGateEvaluationInput,
    gateId: string,
    supervisorRunId: string
  ): Promise<SupervisorGateEvaluationResult | undefined> {
    // The supervisor surface — LLM and deterministic alike — is behind the
    // collaboration flag, and a disabled policy must never act. Without both
    // checks this pass would bypass the flag the LLM path already honours.
    if (!policy.enabled) return undefined;
    if (!(await this.isCollaborationEnabled())) return undefined;

    const rules = parseGuardrailRules(policy.guardrailRulesJson);
    if (rules === null) {
      // Unreadable configuration cannot prove compliance — fail closed.
      return { evaluated: true, autoResolved: false, guardrailVerdict: 'escalated' };
    }
    if (rules.length === 0 || !isGuardrailGateType(gateId)) {
      return undefined;
    }

    const metrics = await this.collectGateMetrics(input);
    if (!metrics) {
      // Missing diff/CI data cannot prove compliance either — fail closed.
      return { evaluated: true, autoResolved: false, guardrailVerdict: 'escalated' };
    }

    const evaluation = this.evaluateGuardrails.execute({
      gate: gateId,
      ...metrics,
      rules,
    });

    if (evaluation.autoApproved) {
      const outcome = await this.approveAgentRun.execute(
        input.runId,
        undefined,
        supervisorActor(supervisorRunId)
      );
      return {
        evaluated: true,
        autoResolved: outcome.approved === true,
        guardrailVerdict: 'auto_approved',
        ...(evaluation.ruleId ? { guardrailRuleId: evaluation.ruleId } : {}),
      };
    }

    if (!evaluation.passed) {
      return { evaluated: true, autoResolved: false, guardrailVerdict: 'escalated' };
    }

    // Every rule passed but at least one requires manual confirmation.
    return undefined;
  }

  /**
   * Gathers the measurable gate context guardrails are evaluated against.
   *
   * Returns `undefined` when any piece cannot be established, so callers treat
   * "unknown" as "not provably within bounds" rather than as zero.
   */
  private async collectGateMetrics(input: SupervisorGateEvaluationInput): Promise<
    | {
        diffLines: number;
        filesChanged: number;
        modifiedFiles: string[];
        ciPassed: boolean;
      }
    | undefined
  > {
    try {
      const feature = await this.featureRepo.findById(input.featureId);
      if (!feature) return undefined;

      const cwd = feature.worktreePath ?? input.repositoryPath;
      const baseBranch = await this.gitPrService.getDefaultBranch(cwd);
      const [summary, fileDiffs] = await Promise.all([
        this.gitPrService.getPrDiffSummary(cwd, baseBranch),
        this.gitPrService.getFileDiffs(cwd, baseBranch),
      ]);

      return {
        diffLines: summary.additions + summary.deletions,
        filesChanged: summary.filesChanged,
        modifiedFiles: fileDiffs.map((diff) => diff.path),
        // No PR yet (prd/plan gates) means CI has demonstrably not passed.
        ciPassed: feature.pr?.ciStatus === CiStatus.Success,
      };
    } catch {
      return undefined;
    }
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }

  private async applyAutonomousVerdict(
    runId: string,
    verdict: SupervisorVerdict,
    supervisorRunId: string
  ): Promise<boolean> {
    const actor = supervisorActor(supervisorRunId);
    if (verdict === SupervisorVerdict.approve) {
      const out = await this.approveAgentRun.execute(runId, undefined, actor);
      return out.approved === true;
    }
    if (verdict === SupervisorVerdict.reject) {
      const out = await this.rejectAgentRun.execute(
        runId,
        'Supervisor rejected (autonomous mode)',
        undefined,
        actor
      );
      return out.rejected === true;
    }
    // advise / escalate stay non-resolving in autonomous mode too — they
    // signal "human needed" and we leave the gate open.
    return false;
  }

  private async resolveScope(
    repositoryPath: string
  ): Promise<{ scopeType: string; scopeId: string }> {
    try {
      const app = await this.applicationRepo.findByPath(repositoryPath);
      if (app?.id) return { scopeType: 'app', scopeId: app.id };
    } catch {
      // Fall through to repo-based scope.
    }
    return { scopeType: 'repo', scopeId: repositoryPath };
  }
}

/**
 * Resolves the per-gate autonomy override stored as JSON on
 * {@link SupervisorPolicy.gateAuthorityJson}. The map is keyed by gate
 * id (matching the LangGraph node name, e.g. `prd`, `plan`, `merge`).
 *
 * Exported so the unit test can exercise the parsing rules without
 * spinning up the full evaluator.
 */
export function resolveEffectiveAutonomy(
  policy: SupervisorPolicy,
  gateId: string
): SupervisorAutonomy {
  if (!policy.gateAuthorityJson) return policy.autonomyLevel;
  try {
    const parsed = JSON.parse(policy.gateAuthorityJson) as Record<string, unknown>;
    const override = parsed[gateId];
    if (typeof override === 'string' && isSupervisorAutonomy(override)) {
      return override;
    }
  } catch {
    // Malformed JSON falls back to the policy default.
  }
  return policy.autonomyLevel;
}

function isSupervisorAutonomy(value: string): value is SupervisorAutonomy {
  return (
    value === SupervisorAutonomy.advisory ||
    value === SupervisorAutonomy.cosign ||
    value === SupervisorAutonomy.autonomous
  );
}

/** True when a LangGraph interrupt node maps onto a guardrail-governed gate. */
export function isGuardrailGateType(value: string): value is GuardrailGateType {
  return (Object.values(GuardrailGateType) as string[]).includes(value);
}

/**
 * Parses {@link SupervisorPolicy.guardrailRulesJson}.
 *
 * Returns `null` — never an empty list — when the stored value is unreadable or
 * holds even one malformed rule. Callers treat `null` as "cannot prove
 * compliance" and fail closed; silently dropping a broken rule would disable a
 * safety bound without anyone noticing.
 *
 * Exported so the unit test can exercise the parsing rules directly.
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
