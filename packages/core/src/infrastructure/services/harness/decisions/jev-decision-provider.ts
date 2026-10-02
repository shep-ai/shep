/**
 * Jev decision provider (spec 119) — optional, used only when configured.
 *
 * Jev's own API is not public, so this adapter speaks a small JSON bridge
 * contract that a Jev deployment (or any compatible service) exposes:
 *
 *   POST {endpoint}/v1/score   {purpose, query, items:[{id,text,prior}]}   → {scores:[{id,score,probabilities?}], model?}
 *   POST {endpoint}/v1/choice  {purpose, question, choices:[{id,description}], topK} → {ranked:[{id,probability?}], model?}
 *   POST {endpoint}/v1/noul    {purpose, question, context}                → {value, probabilities?, model?}
 *
 * Nothing else in shep depends on Jev; swapping it for an open-source
 * provider is a settings change.
 */
import {
  DecisionProviderKind,
  type DecisionProviderConfig,
} from '../../../../domain/generated/output.js';
import {
  DecisionProviderError,
  type ChoiceRequest,
  type ChoiceResult,
  type IDecisionProvider,
  type NoulRequest,
  type NoulResult,
  type ScoreBatchRequest,
  type ScoreBatchResult,
} from '../../../../application/ports/output/harness/index.js';
import { apiKeyFromEnv, clampScore, postJson } from './http-json.js';

export class JevDecisionProvider implements IDecisionProvider {
  readonly kind = DecisionProviderKind.Jev;
  readonly id: string;

  constructor(private readonly config: DecisionProviderConfig) {
    this.id = config.id;
    if (!config.endpoint) throw new DecisionProviderError(config.id, 'endpoint is required');
  }

  private post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    return postJson<T>(this.id, `${this.config.endpoint!.replace(/\/+$/, '')}${path}`, body, {
      timeoutMs: timeoutMs ?? this.config.timeoutMs,
      apiKey: apiKeyFromEnv(this.config.apiKeyEnv),
    });
  }

  async scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult> {
    const started = Date.now();
    const res = await this.post<{
      scores: { id: string; score?: number; probabilities?: Record<string, number> }[];
      model?: string;
    }>('/v1/score', { purpose: req.purpose, query: req.query, items: req.items }, req.timeoutMs);
    const byId = new Map(res.scores.map((s) => [s.id, s]));
    return {
      scores: req.items.map((i) => {
        const s = byId.get(i.id);
        return {
          id: i.id,
          score: clampScore(s?.score),
          ...(s?.probabilities && { probabilities: s.probabilities }),
        };
      }),
      ...(res.model && { model: res.model }),
      latencyMs: Date.now() - started,
    };
  }

  async choice(req: ChoiceRequest): Promise<ChoiceResult> {
    const started = Date.now();
    const res = await this.post<{ ranked: { id: string; probability?: number }[]; model?: string }>(
      '/v1/choice',
      { purpose: req.purpose, question: req.question, choices: req.choices, topK: req.topK },
      req.timeoutMs
    );
    return {
      ranked: res.ranked,
      ...(res.model && { model: res.model }),
      latencyMs: Date.now() - started,
    };
  }

  async noul(req: NoulRequest): Promise<NoulResult> {
    const started = Date.now();
    const res = await this.post<{
      value: NoulResult['value'];
      probabilities?: Record<string, number>;
      model?: string;
    }>(
      '/v1/noul',
      { purpose: req.purpose, question: req.question, context: req.context },
      req.timeoutMs
    );
    return {
      value: res.value,
      ...(res.probabilities && { probabilities: res.probabilities }),
      ...(res.model && { model: res.model }),
      latencyMs: Date.now() - started,
    };
  }
}
