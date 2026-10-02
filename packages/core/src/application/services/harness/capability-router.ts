/**
 * CapabilityRouter (spec 119, docs/05 "Routing flow"):
 * intent → candidate capabilities (lexical top-N) → capability choice
 * (decision provider, recorded) → implementation (filtered, ranked).
 *
 * When the model already named a capability, that choice is enforced; in
 * shadow tool-routing mode the router still records what it would have picked.
 */
import {
  HarnessDecisionKind,
  HarnessTaskType,
  RiskClass,
  ToolReadWriteMode,
  type Capability,
  type ToolImplementation,
} from '../../../domain/generated/output.js';
import { intentOverlapScore, intentTokens } from '../../../domain/shared/lexical-relevance.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { DecisionContext, DecisionService } from './decision-service.js';

/** At most this many capabilities are put in front of a decision provider. */
export const DEFAULT_CAPABILITY_CANDIDATE_LIMIT = 12;

const RISK_ORDER: Record<RiskClass, number> = {
  [RiskClass.Low]: 0,
  [RiskClass.Medium]: 1,
  [RiskClass.High]: 2,
};

export interface CapabilityIntent {
  description: string;
  /** Capability the model asked for, if any. */
  capabilityId?: string;
  taskType: HarnessTaskType;
}

export interface CapabilityPlan {
  capabilityId: string;
  implementation: ToolImplementation;
  capabilityDecisionId?: string;
  candidates: string[];
}

export class CapabilityRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRoutingError';
  }
}

export class CapabilityRouter {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly decisions: DecisionService,
    private readonly options: { candidateLimit?: number; shadow?: boolean } = {}
  ) {}

  /** Deterministic candidate retrieval: tag + snippet overlap, best first. */
  candidates(
    description: string,
    limit = this.options.candidateLimit ?? DEFAULT_CAPABILITY_CANDIDATE_LIMIT
  ): Capability[] {
    const q = intentTokens(description);
    return this.registry
      .list()
      .map((c, index) => ({
        c,
        index,
        score: intentOverlapScore(
          q,
          `${c.id.replace(/_/g, ' ')} ${c.title} ${c.snippet} ${c.tags.join(' ')}`
        ),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map((x) => x.c);
  }

  async resolve(intent: CapabilityIntent, ctx: DecisionContext): Promise<CapabilityPlan> {
    const candidates = this.candidates(intent.description);
    const explicit = intent.capabilityId ? this.registry.get(intent.capabilityId) : undefined;
    if (intent.capabilityId && !explicit) {
      throw new CapabilityRoutingError(
        `Unknown capability "${intent.capabilityId}". Available: ${this.registry
          .list()
          .map((c) => c.id)
          .join(', ')}`
      );
    }
    let capabilityId: string;
    let capabilityDecisionId: string | undefined;
    const choices = candidates.map((c) => ({
      id: c.id,
      description: c.tags.length ? `${c.snippet} (${c.tags.join(', ')})` : c.snippet,
    }));
    if (explicit) {
      capabilityId = explicit.id;
      if (this.options.shadow) {
        const shadow = await this.decisions.choice(
          { purpose: HarnessDecisionKind.CapabilityChoice, question: intent.description, choices },
          { ...ctx, shadow: true }
        );
        capabilityDecisionId = shadow.decision.id;
      }
    } else {
      const { result, decision } = await this.decisions.choice(
        { purpose: HarnessDecisionKind.CapabilityChoice, question: intent.description, choices },
        ctx
      );
      capabilityId = result.ranked[0]?.id ?? candidates[0]?.id;
      capabilityDecisionId = decision.id;
    }
    return {
      capabilityId,
      implementation: this.chooseImplementation(capabilityId, intent.taskType),
      ...(capabilityDecisionId && { capabilityDecisionId }),
      candidates: candidates.map((c) => c.id),
    };
  }

  /** Filter by availability and task type, then prefer the lowest risk. */
  chooseImplementation(capabilityId: string, taskType: HarnessTaskType): ToolImplementation {
    const eligible = this.registry
      .implementations(capabilityId)
      .filter(
        (i) => taskType !== HarnessTaskType.ReadOnly || i.readWriteMode === ToolReadWriteMode.Read
      )
      .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
    if (eligible.length === 0) {
      throw new CapabilityRoutingError(
        `No implementation of "${capabilityId}" is available for a ${taskType} task`
      );
    }
    return eligible[0];
  }
}
