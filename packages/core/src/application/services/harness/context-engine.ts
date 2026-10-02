/**
 * ContextEngine (spec 119, docs/04): builds the persisted, query-specific
 * ContextPlan for one model call and materializes it.
 *
 *   candidates → batched relevance scoring (recorded decision) → score bands
 *   → locks/escalations → render views → budget fit → persist plan → text
 *
 * Conservative by design: no score means "long", pinned chunks are never
 * downgraded, and a decision-provider outage degrades rather than fails.
 */
import { randomUUID } from 'node:crypto';
import {
  CacheStrategyMode,
  ChunkVisibility,
  HarnessDecisionKind,
  HarnessEventType,
  VisibilitySource,
  type ContextPlan,
  type HarnessContextConfig,
  type HarnessTask,
  type PlannedChunk,
} from '../../../domain/generated/output.js';
import { fitToBudget, type BudgetItem } from '../../../domain/harness/budget-fitter.js';
import { estimateTokens, queryFingerprint } from '../../../domain/harness/fingerprints.js';
import { maxVisibility, visibilityForScore } from '../../../domain/harness/visibility-ladder.js';
import type {
  IBlobStore,
  IHarnessContextRepository,
  IHarnessEventLog,
} from '../../ports/output/harness/index.js';
import type { Candidate, CandidateRetriever } from './candidate-retriever.js';
import { materializeContext, type MaterializedChunk } from './context-materializer.js';
export { rematerializePlan } from './context-materializer.js';
import type { DecisionService } from './decision-service.js';
import { RENDERER_VERSIONS, renderChunkView } from './renderers/chunk-renderers.js';

/** Safety headroom kept free inside the input budget. */
export const CONTEXT_HEADROOM_TOKENS = 512;

export interface BuildContextInput {
  sessionId: string;
  task: HarnessTask;
  turn: number;
  query: string;
  repoSnapshotId?: string;
  config: HarnessContextConfig;
  /** Tokens already spent outside the plan (stable prefix, schemas, recent turns). */
  fixedTokens: number;
  promptSectionChunkIds: readonly string[];
  /** Visibility floors requested by expand_chunk (source escalation). */
  escalations: ReadonlyMap<string, ChunkVisibility>;
  /** Chunks a person asked to include (source user). */
  userIncludes: ReadonlySet<string>;
  instructionIds: string[];
  capabilityIds: string[];
  loadedSchemaIds: string[];
  prefixFingerprint?: string;
  prefixTokens?: number;
  shadow: boolean;
}

export interface BuiltContext {
  plan: ContextPlan;
  text: string;
}

interface Working {
  candidate: Candidate;
  raw: string;
  score?: number;
  visibility: ChunkVisibility;
  source: VisibilitySource;
  reasonCode: string;
  views: Record<ChunkVisibility, { content: string; tokens: number; rendererId: string }>;
}

export class ContextEngine {
  constructor(
    private readonly retriever: CandidateRetriever,
    private readonly context: IHarnessContextRepository,
    private readonly blobs: IBlobStore,
    private readonly decisions: DecisionService,
    private readonly events?: IHarnessEventLog
  ) {}

  async build(input: BuildContextInput): Promise<BuiltContext> {
    const planId = randomUUID();
    const candidates = await this.retriever.retrieve({
      sessionId: input.sessionId,
      task: input.task,
      query: input.query,
      promptSectionChunkIds: input.promptSectionChunkIds,
      forcedChunkIds: [...input.escalations.keys(), ...input.userIncludes],
      limit: input.config.candidateLimit,
    });
    const fingerprint = queryFingerprint({
      query: input.query,
      goal: input.task.goal,
      repoSnapshotId: input.repoSnapshotId,
      rendererVersions: RENDERER_VERSIONS,
      instructionIds: input.instructionIds,
    });

    const working: Working[] = [];
    for (const candidate of candidates) {
      const raw = await this.blobs.getText(candidate.chunk.contentRef);
      const views = {} as Working['views'];
      for (const v of [
        ChunkVisibility.Hidden,
        ChunkVisibility.Short,
        ChunkVisibility.Long,
        ChunkVisibility.Full,
      ]) {
        const r = renderChunkView(candidate.chunk, raw, v, input.query);
        views[v] = {
          content: r.content,
          tokens: estimateTokens(r.content),
          rendererId: r.rendererId,
        };
      }
      working.push({
        candidate,
        raw,
        visibility: input.config.uncertainDefault,
        source: VisibilitySource.Deterministic,
        reasonCode: candidate.reasons[0],
        views,
      });
    }

    // Stage 2: one batched relevance decision for everything not pinned.
    const scored = working.filter((w) => w.candidate.lock !== 'pinned');
    let degraded = false;
    let decidedBy: string | undefined;
    let decisionId: string | undefined;
    if (scored.length > 0) {
      try {
        const { result, decision } = await this.decisions.scoreBatch(
          {
            purpose: HarnessDecisionKind.ChunkVisibility,
            query: `${input.query}\n\nTask: ${input.task.goal}`,
            items: scored.map((w) => ({
              id: w.candidate.chunk.id,
              text: `${w.candidate.chunk.label}\n${w.views[ChunkVisibility.Short].content}`.slice(
                0,
                2000
              ),
              prior: w.candidate.prior,
            })),
          },
          {
            sessionId: input.sessionId,
            taskId: input.task.id,
            contextPlanId: planId,
            shadow: input.shadow,
          }
        );
        const byId = new Map(result.scores.map((s) => [s.id, s.score]));
        for (const w of scored) w.score = byId.get(w.candidate.chunk.id);
        degraded = decision.degraded;
        decidedBy = decision.providerId;
        decisionId = decision.id;
      } catch {
        degraded = true;
      }
    }

    for (const w of working) {
      const { chunk, lock } = w.candidate;
      if (lock === 'pinned') {
        w.visibility = ChunkVisibility.Full;
        w.source = VisibilitySource.Policy;
        continue;
      }
      if (w.score === undefined) {
        w.visibility = input.config.uncertainDefault;
        w.source = degraded ? VisibilitySource.Degraded : VisibilitySource.Deterministic;
      } else {
        w.visibility = visibilityForScore(w.score, input.config);
        w.source = degraded
          ? VisibilitySource.Degraded
          : decidedBy === 'deterministic'
            ? VisibilitySource.Deterministic
            : VisibilitySource.Ai;
      }
      // A big chunk is not shown in full just because it is relevant and fits
      // the budget: replaying it every turn is the transcript cost the harness
      // exists to avoid. The agent can still ask for it with expand_chunk.
      if (
        w.visibility === ChunkVisibility.Full &&
        w.views[ChunkVisibility.Full].tokens > input.config.fullTokenCap
      ) {
        w.visibility = ChunkVisibility.Long;
        w.reasonCode = 'size_cap';
      }
      // Explicit requests are credited as the reason a chunk is shown.
      const escalation = input.escalations.get(chunk.id);
      if (escalation) {
        w.visibility = maxVisibility(w.visibility, escalation);
        w.source = VisibilitySource.Escalation;
        w.reasonCode = 'model_requested';
      }
      if (input.userIncludes.has(chunk.id)) {
        w.visibility = maxVisibility(w.visibility, ChunkVisibility.Long);
        w.source = VisibilitySource.User;
        w.reasonCode = 'user_included';
      }
      // Current-task reference sections are never hidden, only shortened.
      if (
        lock === 'visible' &&
        maxVisibility(w.visibility, ChunkVisibility.Short) !== w.visibility
      ) {
        w.visibility = ChunkVisibility.Short;
        w.source = VisibilitySource.Policy;
      }
      if (w.visibility === ChunkVisibility.Hidden && w.score !== undefined) {
        w.reasonCode = 'below_hide_threshold';
      }
    }

    const budget = Math.max(
      0,
      input.config.maxInputTokens -
        input.config.reserveOutputTokens -
        input.fixedTokens -
        CONTEXT_HEADROOM_TOKENS
    );
    const items: BudgetItem[] = working.map((w) => ({
      chunkId: w.candidate.chunk.id,
      visibility: w.visibility,
      priority:
        w.candidate.lock !== 'none' ||
        w.source === VisibilitySource.Escalation ||
        w.source === VisibilitySource.User
          ? 2
          : (w.score ?? w.candidate.prior),
      lock:
        w.candidate.lock === 'pinned'
          ? 'pinned'
          : w.candidate.lock === 'visible' || w.source === VisibilitySource.Escalation
            ? 'visible'
            : 'none',
      tokens: {
        [ChunkVisibility.Hidden]: 0,
        [ChunkVisibility.Short]: w.views[ChunkVisibility.Short].tokens,
        [ChunkVisibility.Long]: w.views[ChunkVisibility.Long].tokens,
        [ChunkVisibility.Full]: w.views[ChunkVisibility.Full].tokens,
      },
    }));
    const fit = fitToBudget(items, budget);

    const planned: PlannedChunk[] = [];
    const shown: MaterializedChunk[] = [];
    const hidden: PlannedChunk[] = [];
    fit.items.forEach((f, i) => {
      const w = working[i];
      const view = w.views[f.visibility];
      const p: PlannedChunk = {
        chunkId: w.candidate.chunk.id,
        kind: w.candidate.chunk.kind,
        label: w.candidate.chunk.label,
        visibility: f.visibility,
        ...(w.score !== undefined && { relevance: Math.round(w.score * 1000) / 1000 }),
        tokens: f.tokens,
        rawTokens: w.views[ChunkVisibility.Full].tokens,
        reasonCode: f.reasonCode ?? w.reasonCode,
        source: f.reasonCode ? VisibilitySource.Budget : w.source,
        ...(decisionId && w.candidate.lock !== 'pinned' && { decisionId }),
        rendererId: view.rendererId,
      };
      planned.push(p);
      if (f.visibility === ChunkVisibility.Hidden) hidden.push(p);
      else shown.push({ planned: p, content: view.content });
    });

    for (const s of shown) {
      if (s.planned.visibility === ChunkVisibility.Full) continue;
      const chunk = working.find((w) => w.candidate.chunk.id === s.planned.chunkId)!.candidate
        .chunk;
      await this.context.putView({
        id: randomUUID(),
        chunkId: chunk.id,
        queryFingerprint: fingerprint,
        visibility: s.planned.visibility,
        content: s.content,
        estimatedTokens: s.planned.tokens,
        rendererId: s.planned.rendererId ?? 'raw@1',
        sourceHash: chunk.contentHash,
        truncated: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const text = materializeContext(shown, hidden);
    const now = new Date();
    const plan: ContextPlan = {
      id: planId,
      taskId: input.task.id,
      turn: input.turn,
      query: input.query,
      queryFingerprint: fingerprint,
      stateVersion: input.task.stateVersion,
      ...(input.repoSnapshotId && { repoSnapshotId: input.repoSnapshotId }),
      chunks: planned,
      instructionIds: input.instructionIds,
      capabilityIds: input.capabilityIds,
      loadedSchemaIds: input.loadedSchemaIds,
      estimatedTokens: fit.totalTokens + input.fixedTokens,
      tokenBudget: input.config.maxInputTokens - input.config.reserveOutputTokens,
      candidateCount: candidates.length,
      cacheStrategy: {
        mode: CacheStrategyMode.StablePrefix,
        ...(input.prefixFingerprint && { prefixFingerprint: input.prefixFingerprint }),
        ...(input.prefixTokens !== undefined && { prefixTokens: input.prefixTokens }),
      },
      degraded,
      shadow: input.shadow,
      overBudget: fit.overBudget,
      ...(decidedBy && { decidedBy }),
      createdAt: now,
      updatedAt: now,
    };
    await this.context.putPlan(plan);
    await this.events?.append({
      sessionId: input.sessionId,
      taskId: input.task.id,
      type: HarnessEventType.ContextPlanCreated,
      payload: {
        contextPlanId: plan.id,
        turn: plan.turn,
        estimatedTokens: plan.estimatedTokens,
        candidates: plan.candidateCount,
        shown: shown.length,
        degraded,
        shadow: input.shadow,
      },
    });
    return { plan, text };
  }
}
