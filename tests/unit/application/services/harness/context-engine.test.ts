import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ChunkKind,
  ChunkVisibility as V,
  HarnessTaskStatus,
  SensitivityLabel,
  VisibilitySource,
  type ContextChunk,
  type HarnessContextConfig,
  type HarnessTask,
} from '@/domain/generated/output.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';
import { ChunkWriter } from '@/application/services/harness/chunk-writer.js';
import { CandidateRetriever } from '@/application/services/harness/candidate-retriever.js';
import {
  ContextEngine,
  rematerializePlan,
  type BuildContextInput,
} from '@/application/services/harness/context-engine.js';
import { DecisionService } from '@/application/services/harness/decision-service.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';
import {
  createHarnessTestStore,
  type HarnessTestStore,
} from '../../../../helpers/harness/harness-test-store.js';
import { makeSession, makeTask } from '../../../../helpers/harness/factories.js';

const REFRESH_TS = 'export function rotateRefreshToken(token: string) {\n  return token;\n}\n';
const README = '# Demo app\n\nDocumentation title and setup instructions.\n';

describe('ContextEngine', () => {
  let store: HarnessTestStore;
  let writer: ChunkWriter;
  let engine: ContextEngine;
  let task: HarnessTask;
  let config: HarnessContextConfig;
  let chunks: Record<string, ContextChunk>;
  const sessionId = 'sess';

  const input = (overrides: Partial<BuildContextInput> = {}): BuildContextInput => ({
    sessionId,
    task,
    turn: 1,
    query: 'rotate the refresh token',
    config,
    fixedTokens: 0,
    promptSectionChunkIds: [chunks.instructions.id, chunks.spec.id],
    escalations: new Map(),
    userIncludes: new Set(),
    instructionIds: ['claude'],
    capabilityIds: ['read_file'],
    loadedSchemaIds: [],
    shadow: false,
    ...overrides,
  });

  const visibilityOf = (plan: { chunks: { chunkId: string; visibility: V }[] }, id: string) =>
    plan.chunks.find((c) => c.chunkId === id)?.visibility;

  beforeEach(async () => {
    store = await createHarnessTestStore();
    config = resolveHarnessConfig(undefined).context;
    const decisions = new DecisionService(
      resolveHarnessConfig(undefined).decisions,
      new DecisionProviderFactory(),
      store.execution,
      store.blobs,
      store.events
    );
    engine = new ContextEngine(
      new CandidateRetriever(store.context),
      store.context,
      store.blobs,
      decisions,
      store.events
    );
    writer = new ChunkWriter(store.context, store.blobs);
    await store.sessions.createSession(makeSession({ id: sessionId }));
    task = makeTask(sessionId, { status: HarnessTaskStatus.Running, goal: 'Improve the project' });
    await store.sessions.createTask(task);
    chunks = {
      instructions: await writer.write({
        sessionId,
        taskId: task.id,
        kind: ChunkKind.PromptSection,
        label: 'Instructions',
        source: 'prompt',
        content: '## Instructions\nWrite tests first.\n',
        pinned: true,
      }),
      spec: await writer.write({
        sessionId,
        taskId: task.id,
        kind: ChunkKind.PromptSection,
        label: 'Spec (spec.yaml)',
        source: 'prompt',
        content: `## Spec\n${'requirement line about billing\n'.repeat(80)}`,
      }),
      refresh: await writer.write({
        sessionId,
        kind: ChunkKind.File,
        label: 'src/auth/refresh.ts',
        source: 'read_file',
        content: REFRESH_TS,
        path: 'src/auth/refresh.ts',
      }),
      readme: await writer.write({
        sessionId,
        kind: ChunkKind.File,
        label: 'README.md',
        source: 'read_file',
        content: README,
        path: 'README.md',
      }),
      secret: await writer.write({
        sessionId,
        kind: ChunkKind.File,
        label: '.env',
        source: 'read_file',
        content: 'KEY=1',
        sensitivity: SensitivityLabel.Secret,
      }),
    };
  });
  afterEach(() => store.close());

  it('shows the same chunk fully for one query and hides it for another, without mutating it', async () => {
    const before = await store.context.getChunk(chunks.refresh.id);
    const a = await engine.build(input({ query: 'rotate the refresh token in refresh.ts' }));
    const b = await engine.build(
      input({ query: 'update the README documentation title', turn: 2 })
    );
    expect(visibilityOf(a.plan, chunks.refresh.id)).toBe(V.Full);
    expect(visibilityOf(b.plan, chunks.refresh.id)).toBe(V.Hidden);
    expect(visibilityOf(b.plan, chunks.readme.id)).not.toBe(V.Hidden);
    expect(await store.context.getChunk(chunks.refresh.id)).toEqual(before);
  });

  it('persists the plan with per-chunk visibility, relevance, tokens, reason and source', async () => {
    const { plan } = await engine.build(
      input({ query: 'rotate refresh token in src/auth/refresh.ts' })
    );
    const saved = await store.context.getPlan(plan.id);
    expect(saved).toEqual(plan);
    const refresh = plan.chunks.find((c) => c.chunkId === chunks.refresh.id)!;
    expect(refresh).toMatchObject({
      visibility: V.Full,
      reasonCode: 'path_match',
      source: VisibilitySource.Deterministic,
    });
    expect(refresh.relevance).toBeGreaterThanOrEqual(0.9);
    const instr = plan.chunks.find((c) => c.chunkId === chunks.instructions.id)!;
    expect(instr).toMatchObject({
      visibility: V.Full,
      source: VisibilitySource.Policy,
      reasonCode: 'current_task',
    });
    expect(plan.decidedBy).toBe('deterministic');
    expect((await store.events.listAfter(sessionId, 0)).map((e) => e.type)).toContain(
      'context_plan.created'
    );
  });

  it('never makes a secret chunk a candidate', async () => {
    const { plan, text } = await engine.build(input());
    expect(plan.chunks.some((c) => c.chunkId === chunks.secret.id)).toBe(false);
    expect(text).not.toContain('KEY=1');
  });

  it('rebuilds the exact model input from the persisted plan alone', async () => {
    const { plan, text } = await engine.build(input({ query: 'rotate the refresh token' }));
    const fromStore = await rematerializePlan(
      (await store.context.getPlan(plan.id))!,
      store.context,
      store.blobs
    );
    expect(fromStore).toBe(text);
  });

  it('keeps pinned sections full and never hides current-task sections, even far over budget', async () => {
    const { plan } = await engine.build(
      input({ config: { ...config, maxInputTokens: 600, reserveOutputTokens: 0 } })
    );
    expect(visibilityOf(plan, chunks.instructions.id)).toBe(V.Full);
    expect(visibilityOf(plan, chunks.spec.id)).not.toBe(V.Hidden);
    expect(plan.overBudget).toBe(true);
  });

  it('lists hidden candidates by id so the model can expand them', async () => {
    const { text } = await engine.build(input({ query: 'update the README documentation title' }));
    expect(text).toContain('<hidden_chunks');
    expect(text).toContain(`${chunks.refresh.id} file src/auth/refresh.ts`);
  });

  it('honours expand_chunk escalations and user includes', async () => {
    const { plan } = await engine.build(
      input({
        query: 'update the README documentation title',
        escalations: new Map([[chunks.refresh.id, V.Full]]),
      })
    );
    expect(plan.chunks.find((c) => c.chunkId === chunks.refresh.id)).toMatchObject({
      visibility: V.Full,
      source: VisibilitySource.Escalation,
    });
    const inc = await engine.build(
      input({
        query: 'update the README documentation title',
        userIncludes: new Set([chunks.refresh.id]),
      })
    );
    expect(inc.plan.chunks.find((c) => c.chunkId === chunks.refresh.id)).toMatchObject({
      visibility: V.Long,
      source: VisibilitySource.User,
      reasonCode: 'user_included',
    });
  });

  it('degrades conservatively when no decision provider can answer', async () => {
    const failing = {
      scoreBatch: async () => {
        throw new Error('all providers down');
      },
    } as unknown as DecisionService;
    const degradedEngine = new ContextEngine(
      new CandidateRetriever(store.context),
      store.context,
      store.blobs,
      failing
    );
    const { plan } = await degradedEngine.build(input({ query: 'anything' }));
    expect(plan.degraded).toBe(true);
    expect(plan.chunks.find((c) => c.chunkId === chunks.readme.id)).toMatchObject({
      visibility: V.Long,
      source: VisibilitySource.Degraded,
    });
    expect(visibilityOf(plan, chunks.instructions.id)).toBe(V.Full);
  });

  it('records shadow plans and shadow decisions without enforcing them', async () => {
    const { plan } = await engine.build(input({ shadow: true }));
    expect(plan.shadow).toBe(true);
    const decisions = await store.execution.listDecisions(task.id);
    expect(decisions.every((d) => d.shadow && !d.enforced)).toBe(true);
  });

  it('respects the candidate limit', async () => {
    for (let i = 0; i < 30; i++) {
      await writer.write({
        sessionId,
        kind: ChunkKind.File,
        label: `src/f${i}.ts`,
        source: 'read_file',
        content: `export const f${i} = ${i};`,
        path: `src/f${i}.ts`,
      });
    }
    const { plan } = await engine.build(input({ config: { ...config, candidateLimit: 10 } }));
    expect(plan.candidateCount).toBe(10);
  });

  it('supersedes an older read of the same path', async () => {
    const newer = await writer.write({
      sessionId,
      kind: ChunkKind.File,
      label: 'src/auth/refresh.ts',
      source: 'read_file',
      content: `${REFRESH_TS}// v2\n`,
      path: 'src/auth/refresh.ts',
    });
    const { plan } = await engine.build(input({ query: 'refresh.ts' }));
    expect(plan.chunks.some((c) => c.chunkId === chunks.refresh.id)).toBe(false);
    expect(plan.chunks.some((c) => c.chunkId === newer.id)).toBe(true);
  });
});
