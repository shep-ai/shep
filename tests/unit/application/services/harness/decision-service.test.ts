import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DecisionProviderKind,
  HarnessDecisionKind,
  type HarnessDecisionsConfig,
} from '@/domain/generated/output.js';
import {
  DecisionProviderError,
  type IDecisionProvider,
  type IDecisionProviderFactory,
  type ScoreBatchRequest,
  type ChoiceRequest,
} from '@/application/ports/output/harness/index.js';
import { DecisionService } from '@/application/services/harness/decision-service.js';
import { DeterministicDecisionProvider } from '@/infrastructure/services/harness/decisions/deterministic-decision-provider.js';
import {
  createHarnessTestStore,
  type HarnessTestStore,
} from '../../../../helpers/harness/harness-test-store.js';

function fakeProvider(id: string, behaviour: 'ok' | 'fail', score = 0.7): IDecisionProvider {
  return {
    id,
    kind: DecisionProviderKind.OpenAiCompatible,
    scoreBatch: vi.fn(async (req: ScoreBatchRequest) => {
      if (behaviour === 'fail') throw new DecisionProviderError(id, 'down');
      return {
        scores: req.items.map((i) => ({ id: i.id, score })),
        latencyMs: 5,
        model: `${id}-model`,
      };
    }),
    choice: vi.fn(async (req: ChoiceRequest) => {
      if (behaviour === 'fail') throw new DecisionProviderError(id, 'down');
      return {
        ranked: req.choices.map((c, i) => ({ id: c.id, probability: i === 0 ? 0.9 : 0.1 })),
        latencyMs: 3,
      };
    }),
    noul: vi.fn(),
  };
}

function factoryWith(providers: Record<string, IDecisionProvider>): IDecisionProviderFactory {
  return {
    deterministic: () => new DeterministicDecisionProvider(),
    create: (config) => {
      const p = providers[config.id];
      if (!p) throw new DecisionProviderError(config.id, 'unknown');
      return p;
    },
  };
}

const cfg = (overrides: Partial<HarnessDecisionsConfig> = {}): HarnessDecisionsConfig => ({
  providers: [
    { id: 'local-reranker', kind: DecisionProviderKind.Reranker, endpoint: 'http://x' },
    {
      id: 'local-llm',
      kind: DecisionProviderKind.OpenAiCompatible,
      endpoint: 'http://y',
      model: 'm',
    },
  ],
  routes: { chunkVisibility: 'local-reranker', capabilityChoice: 'local-llm' },
  defaultProviderId: 'deterministic',
  fallbackProviderIds: ['local-llm'],
  ...overrides,
});

const scoreReq = {
  purpose: HarnessDecisionKind.ChunkVisibility,
  query: 'refresh token',
  items: [{ id: 'c1', text: 'refresh token code' }],
};

describe('DecisionService', () => {
  let store: HarnessTestStore;
  beforeEach(async () => {
    store = await createHarnessTestStore();
  });
  afterEach(() => store.close());

  it('routes each kind to its configured provider and ends every chain with deterministic', () => {
    const svc = new DecisionService(cfg(), factoryWith({}), store.execution, store.blobs);
    expect(svc.chainIds(HarnessDecisionKind.ChunkVisibility)).toEqual([
      'local-reranker',
      'local-llm',
      'deterministic',
    ]);
    expect(svc.chainIds(HarnessDecisionKind.CapabilityChoice)).toEqual([
      'local-llm',
      'deterministic',
    ]);
    expect(svc.chainIds(HarnessDecisionKind.Sensitivity)).toEqual(['deterministic', 'local-llm']);
  });

  it('swapping Jev for an open-source provider is a config change only', async () => {
    const jev = fakeProvider('jev', 'ok', 0.4);
    const reranker = fakeProvider('local-reranker', 'ok', 0.8);
    const withJev = new DecisionService(
      cfg({
        providers: [{ id: 'jev', kind: DecisionProviderKind.Jev, endpoint: 'http://j' }],
        routes: { chunkVisibility: 'jev' },
        fallbackProviderIds: [],
      }),
      factoryWith({ jev }),
      store.execution,
      store.blobs
    );
    const withReranker = new DecisionService(
      cfg({ fallbackProviderIds: [] }),
      factoryWith({ 'local-reranker': reranker }),
      store.execution,
      store.blobs
    );
    expect((await withJev.scoreBatch(scoreReq)).decision.providerId).toBe('jev');
    expect((await withReranker.scoreBatch(scoreReq)).decision.providerId).toBe('local-reranker');
  });

  it('persists every decision with input blob, result, latency and enforcement flags', async () => {
    const svc = new DecisionService(
      cfg(),
      factoryWith({ 'local-reranker': fakeProvider('local-reranker', 'ok') }),
      store.execution,
      store.blobs,
      store.events
    );
    const { decision } = await svc.scoreBatch(scoreReq, { taskId: 't1', sessionId: 's1' });
    const saved = await store.execution.getDecision(decision.id);
    expect(saved).toMatchObject({
      taskId: 't1',
      kind: HarnessDecisionKind.ChunkVisibility,
      providerId: 'local-reranker',
      model: 'local-reranker-model',
      enforced: true,
      shadow: false,
      degraded: false,
      result: { scores: [{ id: 'c1', score: 0.7 }] },
    });
    expect(await store.blobs.exists(saved!.inputRef)).toBe(true);
    expect((await store.events.listAfter('s1', 0)).map((e) => e.type)).toEqual([
      'decision.recorded',
    ]);
  });

  it('falls back along the chain and marks the decision degraded', async () => {
    const svc = new DecisionService(
      cfg(),
      factoryWith({
        'local-reranker': fakeProvider('local-reranker', 'fail'),
        'local-llm': fakeProvider('local-llm', 'fail'),
      }),
      store.execution,
      store.blobs
    );
    const { decision, result } = await svc.scoreBatch(scoreReq);
    expect(decision.providerId).toBe('deterministic');
    expect(decision.degraded).toBe(true);
    expect(decision.failedProviders).toEqual([
      'local-reranker: [local-reranker] down',
      'local-llm: [local-llm] down',
    ]);
    expect(result.scores[0].score).toBeGreaterThan(0);
  });

  it('records shadow decisions as shadow and not enforced', async () => {
    const svc = new DecisionService(
      cfg(),
      factoryWith({ 'local-reranker': fakeProvider('local-reranker', 'ok') }),
      store.execution,
      store.blobs
    );
    const { decision } = await svc.scoreBatch(scoreReq, { shadow: true });
    expect(decision).toMatchObject({ shadow: true, enforced: false });
  });

  it('records the ranked alternatives and top probability for a choice', async () => {
    const svc = new DecisionService(
      cfg(),
      factoryWith({ 'local-llm': fakeProvider('local-llm', 'ok') }),
      store.execution,
      store.blobs
    );
    const { decision } = await svc.choice({
      purpose: HarnessDecisionKind.CapabilityChoice,
      question: 'find code',
      choices: [
        { id: 'search_source_code', description: 'find' },
        { id: 'read_file', description: 'read' },
      ],
    });
    expect(decision.result).toEqual({ selected: 'search_source_code' });
    expect(decision.confidence).toBe(0.9);
    expect(decision.alternatives).toHaveLength(2);
  });

  it('skips an unconfigured provider id instead of throwing', async () => {
    const svc = new DecisionService(
      cfg({ routes: { chunkVisibility: 'ghost' }, fallbackProviderIds: [] }),
      factoryWith({}),
      store.execution,
      store.blobs
    );
    const { decision } = await svc.scoreBatch(scoreReq);
    expect(decision.providerId).toBe('deterministic');
    expect(decision.failedProviders?.[0]).toContain('not configured');
  });
});
