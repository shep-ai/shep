/**
 * Decision provider conformance suite (spec 119).
 *
 * Every adapter that can replace Jev must pass the same contract: result
 * shapes, one request per batch, typed errors on timeout/HTTP failure, real
 * probabilities only when the backend produced them, and zero network
 * traffic from the deterministic provider.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DecisionProviderKind,
  HarnessDecisionKind,
  type DecisionProviderConfig,
} from '@/domain/generated/output.js';
import {
  DecisionProviderError,
  type IDecisionProvider,
} from '@/application/ports/output/harness/index.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';

type FetchReply = (url: string, body: Record<string, unknown>) => unknown;

function stubFetch(reply: FetchReply) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    return new Response(JSON.stringify(reply(url, body)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

const ITEMS = [
  { id: 'a', text: 'src/auth/refresh.ts refresh token rotation' },
  { id: 'b', text: 'README.md project overview' },
];
const CHOICES = [
  { id: 'search_source_code', description: 'find source locations' },
  { id: 'read_file', description: 'read a file' },
];

/** Backend reply builders per adapter kind: a well-formed answer for each call. */
const BACKENDS: Record<string, { config: DecisionProviderConfig; reply: FetchReply }> = {
  'openai-compatible': {
    config: {
      id: 'local-llm',
      kind: DecisionProviderKind.OpenAiCompatible,
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b-instruct',
    },
    reply: (_url, body) => {
      if (body.response_format) {
        return {
          model: 'qwen2.5:7b-instruct',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scores: [
                    { id: 'a', score: 0.9 },
                    { id: 'b', score: 0.05 },
                  ],
                }),
              },
            },
          ],
        };
      }
      return {
        model: 'qwen2.5:7b-instruct',
        choices: [
          {
            message: { content: 'A' },
            logprobs: {
              content: [
                {
                  token: 'A',
                  top_logprobs: [
                    { token: 'A', logprob: Math.log(0.8) },
                    { token: 'B', logprob: Math.log(0.15) },
                  ],
                },
              ],
            },
          },
        ],
      };
    },
  },
  reranker: {
    config: {
      id: 'local-reranker',
      kind: DecisionProviderKind.Reranker,
      endpoint: 'http://localhost:8080/rerank',
      model: 'BAAI/bge-reranker-v2-m3',
    },
    reply: (_url, body) =>
      (body.texts as string[]).map((t, index) => ({
        index,
        score: /refresh|source/.test(t) ? 0.92 : 0.03,
      })),
  },
  jev: {
    config: { id: 'jev', kind: DecisionProviderKind.Jev, endpoint: 'http://jev.local' },
    reply: (url) =>
      url.endsWith('/v1/score')
        ? {
            scores: [
              { id: 'a', score: 0.9 },
              { id: 'b', score: 0.05 },
            ],
            model: 'jev-1',
          }
        : {
            ranked: [
              { id: 'search_source_code', probability: 0.9 },
              { id: 'read_file', probability: 0.1 },
            ],
          },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(Object.entries(BACKENDS))('%s decision provider conformance', (_name, backend) => {
  const make = (): IDecisionProvider => new DecisionProviderFactory().create(backend.config);

  it('scores a batch with one request and returns one score per item, in order', async () => {
    const calls = stubFetch(backend.reply);
    const res = await make().scoreBatch({
      purpose: HarnessDecisionKind.ChunkVisibility,
      query: 'make refresh tokens rotate',
      items: ITEMS,
    });
    expect(calls).toHaveLength(1);
    expect(res.scores.map((s) => s.id)).toEqual(['a', 'b']);
    for (const s of res.scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
    expect(res.scores[0].score!).toBeGreaterThan(res.scores[1].score!);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('ranks choices best first', async () => {
    stubFetch(backend.reply);
    const res = await make().choice({
      purpose: HarnessDecisionKind.CapabilityChoice,
      question: 'find where refresh tokens are rotated in source',
      choices: CHOICES,
    });
    expect(res.ranked[0].id).toBe('search_source_code');
    expect(res.ranked.map((r) => r.id).sort()).toEqual(['read_file', 'search_source_code']);
  });

  it('turns an HTTP failure into a DecisionProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    );
    await expect(
      make().scoreBatch({ purpose: HarnessDecisionKind.ChunkVisibility, query: 'q', items: ITEMS })
    ).rejects.toBeInstanceOf(DecisionProviderError);
  });

  it('turns a timeout into a DecisionProviderError that names the budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      })
    );
    await expect(
      make().scoreBatch({
        purpose: HarnessDecisionKind.ChunkVisibility,
        query: 'q',
        items: ITEMS,
        timeoutMs: 1234,
      })
    ).rejects.toThrow(/timed out after 1234ms/);
  });
});

describe('probabilities are real or absent', () => {
  it('openai-compatible reports logprob-derived probabilities for choice', async () => {
    stubFetch(BACKENDS['openai-compatible'].reply);
    const res = await new DecisionProviderFactory()
      .create(BACKENDS['openai-compatible'].config)
      .choice({ purpose: HarnessDecisionKind.CapabilityChoice, question: 'q', choices: CHOICES });
    expect(res.ranked[0].probability).toBeCloseTo(0.8, 5);
  });

  it('openai-compatible omits probabilities when the server returns no logprobs', async () => {
    stubFetch(() => ({ choices: [{ message: { content: 'B' } }] }));
    const res = await new DecisionProviderFactory()
      .create(BACKENDS['openai-compatible'].config)
      .choice({ purpose: HarnessDecisionKind.CapabilityChoice, question: 'q', choices: CHOICES });
    expect(res.ranked[0]).toEqual({ id: 'read_file' });
  });

  it('reranker never reports class probabilities and cannot answer yes/no', async () => {
    stubFetch(BACKENDS.reranker.reply);
    const p = new DecisionProviderFactory().create(BACKENDS.reranker.config);
    const res = await p.scoreBatch({
      purpose: HarnessDecisionKind.ChunkVisibility,
      query: 'refresh',
      items: ITEMS,
    });
    expect(res.scores.every((s) => s.probabilities === undefined)).toBe(true);
    await expect(
      p.noul({ purpose: HarnessDecisionKind.PermissionRisk, question: 'safe?' })
    ).rejects.toBeInstanceOf(DecisionProviderError);
  });

  it('reranker squashes raw logits into (0, 1)', async () => {
    stubFetch((_u, body) =>
      (body.texts as string[]).map((_t, index) => ({ index, score: index === 0 ? 4 : -4 }))
    );
    const res = await new DecisionProviderFactory()
      .create(BACKENDS.reranker.config)
      .scoreBatch({ purpose: HarnessDecisionKind.ChunkVisibility, query: 'q', items: ITEMS });
    expect(res.scores[0].score).toBeCloseTo(0.982, 2);
    expect(res.scores[1].score).toBeCloseTo(0.018, 2);
  });
});

describe('deterministic provider', () => {
  it('makes no network request', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const p = new DecisionProviderFactory().deterministic();
    await p.scoreBatch({
      purpose: HarnessDecisionKind.ChunkVisibility,
      query: 'refresh token',
      items: ITEMS,
    });
    await p.choice({
      purpose: HarnessDecisionKind.CapabilityChoice,
      question: 'search source',
      choices: CHOICES,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('never scores below the retrieval prior and ranks lexical matches first', async () => {
    const p = new DecisionProviderFactory().deterministic();
    const res = await p.scoreBatch({
      purpose: HarnessDecisionKind.ChunkVisibility,
      query: 'refresh token rotation',
      items: [
        { id: 'pinned-ish', text: 'unrelated', prior: 0.95 },
        { id: 'match', text: 'refresh token rotation logic' },
        { id: 'noise', text: 'changelog' },
      ],
    });
    const byId = Object.fromEntries(res.scores.map((s) => [s.id, s.score!]));
    expect(byId['pinned-ish']).toBe(0.95);
    expect(byId.match).toBeGreaterThan(byId.noise);
    expect(byId.noise).toBe(0);
  });

  it('requires an endpoint for HTTP providers', () => {
    expect(() =>
      new DecisionProviderFactory().create({ id: 'x', kind: DecisionProviderKind.Reranker })
    ).toThrow(DecisionProviderError);
  });
});
