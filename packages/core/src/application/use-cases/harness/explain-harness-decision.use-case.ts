/**
 * ExplainHarnessDecisionUseCase (spec 119, F6 "Why?"): why a chunk got its
 * visibility, why a capability was chosen, or why an action was allowed,
 * asked about or denied — with ids that resolve to the plan, chunk, tool call
 * or rule behind it. Probabilities appear only when the provider returned them.
 */
import { inject, injectable } from 'tsyringe';
import type {
  HarnessConfig,
  HarnessDecision,
  PermissionDecision,
  PlannedChunk,
} from '../../../domain/generated/output.js';
import { resolveHarnessConfig } from '../../../domain/harness/harness-config.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import {
  HARNESS_TOKENS,
  type IHarnessContextRepository,
  type IHarnessExecutionRepository,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
  type IPolicyEngine,
} from '../../ports/output/harness/index.js';
import { HarnessNotFoundError } from './harness-errors.js';

export interface ExplainHarnessDecisionInput {
  /** A HarnessDecision id or a PermissionDecision id. */
  decisionId?: string;
  /** Or one chunk's row in a context plan. */
  planId?: string;
  chunkId?: string;
}

export interface VisibilityBands {
  hide: number;
  long: number;
  full: number;
}

export interface HarnessDecisionExplanation {
  decision?: HarnessDecision;
  planned?: PlannedChunk;
  permission?: PermissionDecision;
  /** Human reasons of the policy rules that matched a permission decision. */
  ruleReasons?: { ruleId: string; reason?: string }[];
  /** The relevance score of the chunk, if one was computed. */
  score?: number;
  bands: VisibilityBands;
  sourceIds: {
    contextPlanId?: string;
    taskId?: string;
    chunkIds: string[];
    toolCallId?: string;
    ruleIds: string[];
  };
}

function bandsOf(config: HarnessConfig): VisibilityBands {
  return {
    hide: config.context.hideThreshold,
    long: config.context.longThreshold,
    full: config.context.fullThreshold,
  };
}

function scoreFor(decision: HarnessDecision | undefined, chunkId: string): number | undefined {
  const scores = (
    decision?.result as { scores?: { id: string; score: number | null }[] } | undefined
  )?.scores;
  const hit = scores?.find((s) => s.id === chunkId);
  return hit?.score ?? undefined;
}

@injectable()
export class ExplainHarnessDecisionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.ExecutionRepository)
    private readonly execution: IHarnessExecutionRepository,
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository,
    @inject(HARNESS_TOKENS.PermissionRepository)
    private readonly permissions: IHarnessPermissionRepository,
    @inject(HARNESS_TOKENS.PolicyEngine) private readonly policy: IPolicyEngine,
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository
  ) {}

  async execute(input: ExplainHarnessDecisionInput): Promise<HarnessDecisionExplanation> {
    const bands = bandsOf(resolveHarnessConfig((await this.settings.load())?.harness));

    if (input.planId && input.chunkId) {
      const plan = await this.context.getPlan(input.planId);
      if (!plan) throw new HarnessNotFoundError('context plan', input.planId);
      const planned = plan.chunks.find((c) => c.chunkId === input.chunkId);
      if (!planned) throw new HarnessNotFoundError('plan row', `${input.planId}/${input.chunkId}`);
      const decision = planned.decisionId
        ? ((await this.execution.getDecision(planned.decisionId)) ?? undefined)
        : undefined;
      const score = planned.relevance ?? scoreFor(decision, planned.chunkId);
      return {
        ...(decision && { decision }),
        planned,
        ...(score !== undefined && { score }),
        bands,
        sourceIds: {
          contextPlanId: plan.id,
          taskId: plan.taskId,
          chunkIds: [planned.chunkId],
          ruleIds: [],
        },
      };
    }

    if (!input.decisionId) throw new HarnessNotFoundError('decision', '(none given)');
    const decision = await this.execution.getDecision(input.decisionId);
    if (decision) {
      const scores = (decision.result as { scores?: { id: string }[] }).scores ?? [];
      return {
        decision,
        bands,
        sourceIds: {
          ...(decision.contextPlanId && { contextPlanId: decision.contextPlanId }),
          ...(decision.taskId && { taskId: decision.taskId }),
          chunkIds: scores.map((s) => s.id),
          ruleIds: [],
        },
      };
    }

    const permission = await this.permissions.getPermission(input.decisionId);
    if (!permission) throw new HarnessNotFoundError('decision', input.decisionId);
    const session = await this.sessions.getSession(permission.sessionId);
    const repoRoot = session?.worktreePath ?? session?.repoRoot ?? '';
    const ruleReasons = await Promise.all(
      permission.matchedRuleIds.map(async (ruleId) => {
        const reason = await this.policy.reasonFor(ruleId, repoRoot);
        return { ruleId, ...(reason && { reason }) };
      })
    );
    return {
      permission,
      ruleReasons,
      bands,
      sourceIds: {
        taskId: permission.taskId,
        chunkIds: [],
        ...(permission.toolCallId && { toolCallId: permission.toolCallId }),
        ruleIds: permission.matchedRuleIds,
      },
    };
  }
}
