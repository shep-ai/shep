/**
 * Decision providers (spec 119, docs/14 "DecisionProvider").
 *
 * A decision provider answers small typed questions — how relevant is this
 * chunk, which capability fits this intent — so the coding model never has to.
 * Jev is one implementation; deterministic heuristics, any OpenAI-compatible
 * LLM server and cross-encoder rerank endpoints are others. Callers never know
 * which one answered except through the recorded HarnessDecision.
 */
import type {
  DecisionProviderConfig,
  DecisionProviderKind,
  HarnessDecisionKind,
} from '../../../../domain/generated/output.js';

export interface DecisionItem {
  id: string;
  /** Text the provider judges (a rendered short view, a capability snippet). */
  text: string;
  /** Deterministic prior in [0, 1] from candidate retrieval, if any. */
  prior?: number;
}

export interface ScoreBatchRequest {
  purpose: HarnessDecisionKind;
  query: string;
  items: DecisionItem[];
  timeoutMs?: number;
}

export interface ItemScore {
  id: string;
  /** Relevance in [0, 1]; undefined when the provider could not judge it. */
  score?: number;
  /** Class probabilities, only when the provider really produced them. */
  probabilities?: Record<string, number>;
}

export interface ChoiceRequest {
  purpose: HarnessDecisionKind;
  question: string;
  choices: { id: string; description: string }[];
  topK?: number;
  timeoutMs?: number;
}

export interface NoulRequest {
  purpose: HarnessDecisionKind;
  question: string;
  context?: string;
  timeoutMs?: number;
}

export interface DecisionMeta {
  model?: string;
  latencyMs: number;
  estimatedCostUsd?: number;
}

export interface ScoreBatchResult extends DecisionMeta {
  scores: ItemScore[];
}

export interface ChoiceResult extends DecisionMeta {
  /** Choices ranked best first; probability when the provider produced one. */
  ranked: { id: string; probability?: number; score?: number }[];
}

export interface NoulResult extends DecisionMeta {
  value: 'yes' | 'no' | 'unknown';
  probabilities?: Record<string, number>;
}

export interface IDecisionProvider {
  readonly id: string;
  readonly kind: DecisionProviderKind;
  scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult>;
  choice(req: ChoiceRequest): Promise<ChoiceResult>;
  noul(req: NoulRequest): Promise<NoulResult>;
}

/** Builds provider instances from configuration (infrastructure owns HTTP). */
export interface IDecisionProviderFactory {
  create(config: DecisionProviderConfig): IDecisionProvider;
  /** The always-available heuristic provider. */
  deterministic(): IDecisionProvider;
}

/** Thrown by a provider that cannot answer; callers fall back. */
export class DecisionProviderError extends Error {
  constructor(
    readonly providerId: string,
    message: string
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'DecisionProviderError';
  }
}
