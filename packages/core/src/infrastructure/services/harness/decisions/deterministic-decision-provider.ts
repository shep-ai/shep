/**
 * Deterministic decision provider (spec 119): the default and the last
 * fallback. Pure heuristics, no network — CI and offline runs use only this.
 *
 * Relevance = max(prior, lexical overlap with the query). The prior comes
 * from candidate retrieval (path match, current diff, recency, …), so an item
 * a deterministic signal already found relevant is never scored down here.
 */
import {
  DecisionProviderKind,
  type HarnessDecisionKind,
} from '../../../../domain/generated/output.js';
import type {
  ChoiceRequest,
  ChoiceResult,
  IDecisionProvider,
  NoulRequest,
  NoulResult,
  ScoreBatchRequest,
  ScoreBatchResult,
} from '../../../../application/ports/output/harness/index.js';
import { DETERMINISTIC_PROVIDER_ID } from '../../../../domain/harness/harness-config.js';
import { intentOverlapScore, intentTokens } from '../../../../domain/shared/lexical-relevance.js';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export class DeterministicDecisionProvider implements IDecisionProvider {
  readonly id = DETERMINISTIC_PROVIDER_ID;
  readonly kind = DecisionProviderKind.Deterministic;

  async scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult> {
    const started = Date.now();
    const q = intentTokens(req.query);
    return {
      scores: req.items.map((item) => ({
        id: item.id,
        score: clamp01(Math.max(item.prior ?? 0, intentOverlapScore(q, item.text))),
      })),
      latencyMs: Date.now() - started,
    };
  }

  async choice(req: ChoiceRequest): Promise<ChoiceResult> {
    const started = Date.now();
    const q = intentTokens(req.question);
    const ranked = req.choices
      .map((c, index) => ({
        id: c.id,
        score: intentOverlapScore(q, `${c.id.replace(/_/g, ' ')} ${c.description}`),
        index,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, req.topK ?? req.choices.length)
      .map(({ id, score }) => ({ id, score }));
    return { ranked, latencyMs: Date.now() - started };
  }

  async noul(_req: NoulRequest): Promise<NoulResult> {
    return { value: 'unknown', latencyMs: 0 };
  }

  /** Purposes this provider is meaningful for (all of them, conservatively). */
  supports(_purpose: HarnessDecisionKind): boolean {
    return true;
  }
}
