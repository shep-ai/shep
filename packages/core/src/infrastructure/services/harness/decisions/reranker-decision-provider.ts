/**
 * Decision provider for HTTP cross-encoder rerank endpoints (spec 119):
 * Hugging Face text-embeddings-inference (`/rerank`), Infinity, vLLM, and
 * Cohere/Jina-shaped responses. A cross-encoder scores (query, text) pairs,
 * which is exactly chunk relevance and capability choice. It cannot answer
 * yes/no questions, so `noul` throws and the router falls back.
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
  type NoulResult,
  type ScoreBatchRequest,
  type ScoreBatchResult,
} from '../../../../application/ports/output/harness/index.js';
import { apiKeyFromEnv, clampScore, postJson } from './http-json.js';

type RerankResponse =
  | { index: number; score: number }[]
  | { results: { index: number; relevance_score?: number; score?: number }[] };

export class RerankerDecisionProvider implements IDecisionProvider {
  readonly kind = DecisionProviderKind.Reranker;
  readonly id: string;

  constructor(private readonly config: DecisionProviderConfig) {
    this.id = config.id;
    if (!config.endpoint) throw new DecisionProviderError(config.id, 'endpoint is required');
  }

  private async rerank(
    query: string,
    texts: string[],
    timeoutMs?: number
  ): Promise<(number | undefined)[]> {
    const res = await postJson<RerankResponse>(
      this.id,
      this.config.endpoint!,
      {
        query,
        texts,
        documents: texts,
        ...(this.config.model && { model: this.config.model }),
        raw_scores: false,
        return_documents: false,
      },
      {
        timeoutMs: timeoutMs ?? this.config.timeoutMs,
        apiKey: apiKeyFromEnv(this.config.apiKeyEnv),
      }
    );
    const rows = Array.isArray(res) ? res : res.results;
    if (!Array.isArray(rows))
      throw new DecisionProviderError(this.id, 'unexpected rerank response');
    const scores: (number | undefined)[] = texts.map(() => undefined);
    for (const row of rows) {
      const raw =
        'relevance_score' in row && row.relevance_score !== undefined
          ? row.relevance_score
          : row.score;
      if (row.index >= 0 && row.index < texts.length) scores[row.index] = clampScore(raw);
    }
    return scores;
  }

  async scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult> {
    const started = Date.now();
    if (req.items.length === 0) return { scores: [], latencyMs: 0 };
    const scores = await this.rerank(
      req.query,
      req.items.map((i) => i.text),
      req.timeoutMs
    );
    return {
      scores: req.items.map((item, i) => ({ id: item.id, score: scores[i] })),
      ...(this.config.model && { model: this.config.model }),
      latencyMs: Date.now() - started,
    };
  }

  async choice(req: ChoiceRequest): Promise<ChoiceResult> {
    const started = Date.now();
    const scores = await this.rerank(
      req.question,
      req.choices.map((c) => `${c.id.replace(/_/g, ' ')}: ${c.description}`),
      req.timeoutMs
    );
    const ranked = req.choices
      .map((c, i) => ({ id: c.id, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, req.topK ?? req.choices.length);
    return {
      ranked,
      ...(this.config.model && { model: this.config.model }),
      latencyMs: Date.now() - started,
    };
  }

  async noul(): Promise<NoulResult> {
    throw new DecisionProviderError(this.id, 'rerankers cannot answer yes/no questions');
  }
}
