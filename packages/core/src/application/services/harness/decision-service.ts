/**
 * DecisionService (spec 119): routes each decision kind to its configured
 * provider, falls back along the configured chain (always ending with the
 * deterministic provider), and persists every answer as a HarnessDecision.
 *
 * A decision answered by a fallback is marked `degraded` and names the
 * providers that failed, so a flaky local model shows up in `explain` and in
 * eval reports instead of silently changing behaviour.
 */
import { randomUUID } from 'node:crypto';
import {
  HarnessDecisionKind,
  HarnessEventType,
  type HarnessDecision,
  type HarnessDecisionsConfig,
} from '../../../domain/generated/output.js';
import { canonicalJson } from '../../../domain/harness/fingerprints.js';
import { DETERMINISTIC_PROVIDER_ID } from '../../../domain/harness/harness-config.js';
import type {
  ChoiceRequest,
  ChoiceResult,
  IBlobStore,
  IDecisionProvider,
  IDecisionProviderFactory,
  IHarnessEventLog,
  IHarnessExecutionRepository,
  ScoreBatchRequest,
  ScoreBatchResult,
} from '../../ports/output/harness/index.js';

/** Which DecisionRoutes field configures each kind. */
const ROUTE_KEY: Partial<Record<HarnessDecisionKind, keyof HarnessDecisionsConfig['routes']>> = {
  [HarnessDecisionKind.ChunkVisibility]: 'chunkVisibility',
  [HarnessDecisionKind.CapabilityChoice]: 'capabilityChoice',
  [HarnessDecisionKind.ToolChoice]: 'capabilityChoice',
  [HarnessDecisionKind.CacheStrategy]: 'cacheStrategy',
  [HarnessDecisionKind.PermissionRisk]: 'permissionRisk',
};

export interface DecisionContext {
  sessionId?: string;
  taskId?: string;
  contextPlanId?: string;
  /** Computed but not enforced. */
  shadow?: boolean;
}

export interface Recorded<T> {
  result: T;
  decision: HarnessDecision;
}

export class DecisionService {
  constructor(
    private readonly config: HarnessDecisionsConfig,
    private readonly factory: IDecisionProviderFactory,
    private readonly repo: IHarnessExecutionRepository,
    private readonly blobs: IBlobStore,
    private readonly events?: IHarnessEventLog
  ) {}

  /** Provider ids tried for a kind, in order; deterministic is always last. */
  chainIds(kind: HarnessDecisionKind): string[] {
    const routeKey = ROUTE_KEY[kind];
    const route = routeKey ? this.config.routes[routeKey]?.trim() : undefined;
    const routed = route && route.length > 0 ? route : this.config.defaultProviderId;
    const ids = [routed, ...this.config.fallbackProviderIds, DETERMINISTIC_PROVIDER_ID];
    return [...new Set(ids.filter(Boolean))];
  }

  private chain(
    kind: HarnessDecisionKind
  ): { id: string; provider?: IDecisionProvider; error?: string }[] {
    return this.chainIds(kind).map((id) => {
      if (id === DETERMINISTIC_PROVIDER_ID) return { id, provider: this.factory.deterministic() };
      const config = this.config.providers.find((p) => p.id === id);
      if (!config) return { id, error: `provider "${id}" is not configured` };
      try {
        return { id, provider: this.factory.create(config) };
      } catch (error) {
        return { id, error: (error as Error).message };
      }
    });
  }

  private async run<T>(
    kind: HarnessDecisionKind,
    call: (p: IDecisionProvider) => Promise<T>
  ): Promise<{ result: T; provider: IDecisionProvider; failed: string[] }> {
    const failed: string[] = [];
    for (const entry of this.chain(kind)) {
      if (!entry.provider) {
        failed.push(`${entry.id}: ${entry.error}`);
        continue;
      }
      try {
        return { result: await call(entry.provider), provider: entry.provider, failed };
      } catch (error) {
        failed.push(`${entry.id}: ${(error as Error).message}`);
      }
    }
    throw new Error(`Every decision provider failed for ${kind}: ${failed.join('; ')}`);
  }

  async scoreBatch(
    req: ScoreBatchRequest,
    ctx: DecisionContext = {}
  ): Promise<Recorded<ScoreBatchResult>> {
    const { result, provider, failed } = await this.run(req.purpose, (p) => p.scoreBatch(req));
    const decision = await this.record(req.purpose, req.query, req, provider, failed, ctx, {
      result: { scores: result.scores.map((s) => ({ id: s.id, score: s.score ?? null })) },
      model: result.model,
      latencyMs: result.latencyMs,
      estimatedCostUsd: result.estimatedCostUsd,
    });
    return { result, decision };
  }

  async choice(req: ChoiceRequest, ctx: DecisionContext = {}): Promise<Recorded<ChoiceResult>> {
    const { result, provider, failed } = await this.run(req.purpose, (p) => p.choice(req));
    const decision = await this.record(req.purpose, req.question, req, provider, failed, ctx, {
      result: { selected: result.ranked[0]?.id ?? null },
      alternatives: result.ranked.map((r) => ({ ...r })),
      confidence: result.ranked[0]?.probability,
      model: result.model,
      latencyMs: result.latencyMs,
      estimatedCostUsd: result.estimatedCostUsd,
    });
    return { result, decision };
  }

  private async record(
    kind: HarnessDecisionKind,
    question: string,
    input: unknown,
    provider: IDecisionProvider,
    failed: string[],
    ctx: DecisionContext,
    out: {
      result: Record<string, unknown>;
      alternatives?: Record<string, unknown>[];
      confidence?: number;
      model?: string;
      latencyMs: number;
      estimatedCostUsd?: number;
    }
  ): Promise<HarnessDecision> {
    const now = new Date();
    const decision: HarnessDecision = {
      id: randomUUID(),
      ...(ctx.taskId && { taskId: ctx.taskId }),
      kind,
      providerId: provider.id,
      providerKind: provider.kind,
      ...(out.model && { model: out.model }),
      question: question.slice(0, 500),
      inputRef: await this.blobs.put(canonicalJson(input)),
      result: out.result,
      ...(out.alternatives && { alternatives: out.alternatives }),
      ...(out.confidence !== undefined && { confidence: out.confidence }),
      latencyMs: Math.round(out.latencyMs),
      ...(out.estimatedCostUsd !== undefined && { estimatedCostUsd: out.estimatedCostUsd }),
      enforced: !ctx.shadow,
      shadow: ctx.shadow ?? false,
      degraded: failed.length > 0,
      ...(failed.length > 0 && { failedProviders: failed }),
      ...(ctx.contextPlanId && { contextPlanId: ctx.contextPlanId }),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.putDecision(decision);
    if (this.events && ctx.sessionId) {
      await this.events.append({
        sessionId: ctx.sessionId,
        ...(ctx.taskId && { taskId: ctx.taskId }),
        type: HarnessEventType.DecisionRecorded,
        payload: {
          decisionId: decision.id,
          kind,
          providerId: provider.id,
          degraded: decision.degraded,
          shadow: decision.shadow,
        },
      });
    }
    return decision;
  }
}
