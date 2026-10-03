/**
 * Decision provider backed by the harness's own model backend (spec 119):
 * `generateObject` with a JSON schema. Useful when no local LLM or reranker is
 * running; costs coding-model tokens, which the recorded decision reports.
 */
import {
  DecisionProviderKind,
  type DecisionProviderConfig,
} from '../../../../domain/generated/output.js';
import type {
  ChoiceRequest,
  ChoiceResult,
  IDecisionProvider,
  IHarnessModelProvider,
  NoulRequest,
  NoulResult,
  ScoreBatchRequest,
  ScoreBatchResult,
} from '../../../../application/ports/output/harness/index.js';
import { clampScore } from './http-json.js';

const SYSTEM = 'You are a precise classifier inside a coding-agent harness.';

export class StructuredLlmDecisionProvider implements IDecisionProvider {
  readonly kind = DecisionProviderKind.StructuredLlm;
  readonly id: string;

  constructor(
    config: DecisionProviderConfig,
    private readonly model: IHarnessModelProvider
  ) {
    this.id = config.id;
  }

  async scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult> {
    const res = await this.model.generateObject<{ scores: { id: string; score: number }[] }>({
      system: SYSTEM,
      prompt: `Query: ${req.query}\nRate each item's relevance to the query from 0 to 1.\n\n${req.items
        .map((i) => `### ${i.id}\n${i.text}`)
        .join('\n\n')}`,
      schema: {
        type: 'object',
        properties: {
          scores: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'string' }, score: { type: 'number' } },
              required: ['id', 'score'],
            },
          },
        },
        required: ['scores'],
      },
      timeoutMs: req.timeoutMs,
    });
    const byId = new Map(res.object.scores.map((s) => [s.id, clampScore(s.score)]));
    return {
      scores: req.items.map((i) => ({ id: i.id, score: byId.get(i.id) })),
      model: res.modelId,
      latencyMs: res.latencyMs,
      ...(res.usage.costUsd !== undefined && { estimatedCostUsd: res.usage.costUsd }),
    };
  }

  async choice(req: ChoiceRequest): Promise<ChoiceResult> {
    const res = await this.model.generateObject<{ ranking: string[] }>({
      system: SYSTEM,
      prompt: `${req.question}\n\n${req.choices.map((c) => `- ${c.id}: ${c.description}`).join('\n')}\n\nRank the option ids best first.`,
      schema: {
        type: 'object',
        properties: { ranking: { type: 'array', items: { type: 'string' } } },
        required: ['ranking'],
      },
      timeoutMs: req.timeoutMs,
    });
    const known = new Set(req.choices.map((c) => c.id));
    const ranked = res.object.ranking.filter((id) => known.has(id)).map((id) => ({ id }));
    for (const c of req.choices) if (!ranked.some((r) => r.id === c.id)) ranked.push({ id: c.id });
    return {
      ranked: ranked.slice(0, req.topK ?? ranked.length),
      model: res.modelId,
      latencyMs: res.latencyMs,
      ...(res.usage.costUsd !== undefined && { estimatedCostUsd: res.usage.costUsd }),
    };
  }

  async noul(req: NoulRequest): Promise<NoulResult> {
    const res = await this.model.generateObject<{ answer: 'yes' | 'no' | 'unknown' }>({
      system: SYSTEM,
      prompt: `${req.question}${req.context ? `\n\nContext:\n${req.context}` : ''}`,
      schema: {
        type: 'object',
        properties: { answer: { type: 'string', enum: ['yes', 'no', 'unknown'] } },
        required: ['answer'],
      },
      timeoutMs: req.timeoutMs,
    });
    return { value: res.object.answer, model: res.modelId, latencyMs: res.latencyMs };
  }
}
