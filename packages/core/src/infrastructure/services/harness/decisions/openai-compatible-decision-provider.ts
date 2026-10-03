/**
 * Decision provider for any OpenAI-compatible chat server (spec 119):
 * Ollama, vLLM, llama.cpp server, LM Studio, SGLang, LiteLLM, …
 *
 * - choice / noul ask for a single answer token with `logprobs`, so the
 *   provider reports real class probabilities when the server returns them,
 *   and no probabilities (never invented ones) when it does not.
 * - scoreBatch asks for a JSON object of scores in one request per batch.
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

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_TOP_LOGPROBS = 20;
const SYSTEM_PROMPT =
  'You are a precise classifier inside a coding-agent harness. Answer exactly as instructed, with no explanation.';

interface ChatCompletion {
  model?: string;
  choices?: {
    message?: { content?: string | null };
    logprobs?: {
      content?: { token: string; top_logprobs?: { token: string; logprob: number }[] }[];
    };
  }[];
}

function firstTokenProbabilities(res: ChatCompletion): Record<string, number> | undefined {
  const top = res.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs;
  if (!top?.length) return undefined;
  const probs: Record<string, number> = {};
  for (const { token, logprob } of top) {
    const key = token.trim().toUpperCase();
    if (!key) continue;
    probs[key] = (probs[key] ?? 0) + Math.exp(logprob);
  }
  return probs;
}

export class OpenAiCompatibleDecisionProvider implements IDecisionProvider {
  readonly kind = DecisionProviderKind.OpenAiCompatible;
  readonly id: string;

  constructor(private readonly config: DecisionProviderConfig) {
    this.id = config.id;
    if (!config.endpoint) throw new DecisionProviderError(config.id, 'endpoint is required');
    if (!config.model) throw new DecisionProviderError(config.id, 'model is required');
  }

  private async chat(user: string, extra: Record<string, unknown>, timeoutMs?: number) {
    const url = `${this.config.endpoint!.replace(/\/+$/, '')}/chat/completions`;
    return postJson<ChatCompletion>(
      this.id,
      url,
      {
        model: this.config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        ...extra,
      },
      {
        timeoutMs: timeoutMs ?? this.config.timeoutMs,
        apiKey: apiKeyFromEnv(this.config.apiKeyEnv),
      }
    );
  }

  async scoreBatch(req: ScoreBatchRequest): Promise<ScoreBatchResult> {
    const started = Date.now();
    const listing = req.items.map((i) => `### ${i.id}\n${i.text}`).join('\n\n');
    const res = await this.chat(
      `Query: ${req.query}\n\nRate how relevant each item is to answering the query, from 0 (irrelevant) to 1 (required). ` +
        `Reply with JSON only: {"scores":[{"id":"<id>","score":<number>}]}\n\n${listing}`,
      { response_format: { type: 'json_object' } },
      req.timeoutMs
    );
    let parsed: { scores?: { id?: string; score?: unknown }[] };
    try {
      parsed = JSON.parse(res.choices?.[0]?.message?.content ?? '');
    } catch {
      throw new DecisionProviderError(this.id, 'scoreBatch: model did not return JSON');
    }
    const byId = new Map((parsed.scores ?? []).map((s) => [String(s.id), clampScore(s.score)]));
    return {
      scores: req.items.map((i) => ({ id: i.id, score: byId.get(i.id) })),
      model: res.model ?? this.config.model,
      latencyMs: Date.now() - started,
    };
  }

  async choice(req: ChoiceRequest): Promise<ChoiceResult> {
    const started = Date.now();
    const choices = req.choices.slice(0, LABELS.length);
    const listing = choices.map((c, i) => `${LABELS[i]}. ${c.id}: ${c.description}`).join('\n');
    const res = await this.chat(
      `${req.question}\n\n${listing}\n\nAnswer with the single letter of the best option.`,
      { max_tokens: 1, logprobs: true, top_logprobs: Math.min(MAX_TOP_LOGPROBS, choices.length) },
      req.timeoutMs
    );
    const probs = firstTokenProbabilities(res);
    const answer = (res.choices?.[0]?.message?.content ?? '').trim().toUpperCase().charAt(0);
    let ranked: ChoiceResult['ranked'];
    if (probs) {
      ranked = choices
        .map((c, i) => ({ id: c.id, probability: probs[LABELS[i]] ?? 0 }))
        .sort((a, b) => b.probability - a.probability);
    } else {
      const index = LABELS.indexOf(answer);
      if (index < 0 || index >= choices.length) {
        throw new DecisionProviderError(this.id, `choice: unusable answer "${answer}"`);
      }
      ranked = [
        { id: choices[index].id },
        ...choices.filter((_, i) => i !== index).map((c) => ({ id: c.id })),
      ];
    }
    return {
      ranked: ranked.slice(0, req.topK ?? ranked.length),
      model: res.model ?? this.config.model,
      latencyMs: Date.now() - started,
    };
  }

  async noul(req: NoulRequest): Promise<NoulResult> {
    const started = Date.now();
    const res = await this.chat(
      `${req.question}${req.context ? `\n\nContext:\n${req.context}` : ''}\n\nAnswer Y for yes or N for no.`,
      { max_tokens: 1, logprobs: true, top_logprobs: 5 },
      req.timeoutMs
    );
    const probs = firstTokenProbabilities(res);
    const answer = (res.choices?.[0]?.message?.content ?? '').trim().toUpperCase().charAt(0);
    const value = answer === 'Y' ? 'yes' : answer === 'N' ? 'no' : 'unknown';
    return {
      value,
      ...(probs && { probabilities: { yes: probs.Y ?? 0, no: probs.N ?? 0 } }),
      model: res.model ?? this.config.model,
      latencyMs: Date.now() - started,
    };
  }
}
