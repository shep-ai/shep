/**
 * Learned Harness Flow (spec 150)
 *
 * Runs the real feature-agent graph — analyze through merge — with the stub
 * executor wrapped in the learned-harness proxy, and proves that EVERY agent
 * call receives the learned harness (LESSONS.md: a cross-cutting context must
 * reach every agent prompt, not just the first node). With nothing adopted the
 * calls are byte-identical to a run without the proxy.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import { LearnedHarnessExecutorProxy } from '@/infrastructure/services/harness-learning/learned-harness-executor.proxy.js';
import { LearnedHarnessRunSession } from '@/infrastructure/services/harness-learning/learned-harness-run-session.js';
import { HarnessInstallerService } from '@/infrastructure/services/harness-learning/harness-installer.service.js';
import { componentsFromTree } from '@/domain/harness-learning/harness-tree.js';
import { LEARNED_SECTION_TITLE } from '@/domain/harness-learning/harness-install-plan.js';
import {
  AgentType,
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';
import type { AgentExecutionOptions } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  createStubExecutor,
  createStubMergeNodeDeps,
  createTestContext,
  type StubExecutor,
  type TestContext,
} from './setup.js';
import { ALL_GATES_ENABLED, expectNoInterrupts } from './helpers.js';

const VERSION: LearnedHarnessVersion = {
  id: 'v1',
  scope: MemoryScope.Project,
  repositoryPath: '/repo',
  status: LearnedHarnessStatus.Adopted,
  origin: HarnessOrigin.Manual,
  components: componentsFromTree(
    { 'guardrails.md': 'Never edit generated files; regenerate them.' },
    (c) => `h${c.length}`
  ),
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const noExec = vi.fn(async () => {
  throw new Error('not a git repository');
});

function buildGraph(stub: StubExecutor, version: LearnedHarnessVersion | null) {
  const session = new LearnedHarnessRunSession(
    { execute: vi.fn(async () => version) },
    new HarnessInstallerService(noExec),
    '/repo',
    () => undefined
  );
  const executor = new LearnedHarnessExecutorProxy(stub, session);
  return createFeatureAgentGraph(
    { executor, mergeNodeDeps: createStubMergeNodeDeps() },
    createCheckpointer(':memory:')
  );
}

function calls(stub: StubExecutor): { prompt: string; options?: AgentExecutionOptions }[] {
  return stub.execute.mock.calls.map(([prompt, options]) => ({
    prompt: prompt as string,
    options: options as AgentExecutionOptions | undefined,
  }));
}

describe('Graph State Transitions › Learned harness', () => {
  let ctx: TestContext;
  let output: { restore: () => void };

  beforeAll(() => {
    ctx = createTestContext({ withMerge: true });
    ctx.init();
    output = ctx.suppressOutput();
  });

  beforeEach(() => ctx.reset());

  afterAll(() => {
    output.restore();
    ctx.cleanup();
  });

  it('gives every agent call of a Claude Code run the learned system prompt', async () => {
    const stub = createStubExecutor();
    const graph = buildGraph(stub, VERSION);
    const result = await graph.invoke(ctx.initialState(ALL_GATES_ENABLED), ctx.newConfig());
    expectNoInterrupts(result);

    const recorded = calls(stub);
    expect(recorded.length).toBeGreaterThanOrEqual(6);
    for (const { options } of recorded) {
      expect(options?.systemPrompt).toContain(LEARNED_SECTION_TITLE);
      expect(options?.systemPrompt).toContain('Never edit generated files');
    }
  });

  it('puts the learned section in every prompt for an agent without a system prompt', async () => {
    const stub = createStubExecutor();
    (stub as { agentType: AgentType }).agentType = AgentType.GeminiCli;
    const graph = buildGraph(stub, VERSION);
    await graph.invoke(ctx.initialState(ALL_GATES_ENABLED), ctx.newConfig());

    for (const { prompt } of calls(stub)) expect(prompt).toContain(LEARNED_SECTION_TITLE);
  });

  it('changes nothing when no version is adopted', async () => {
    const plain = createStubExecutor();
    await createFeatureAgentGraph(
      { executor: plain, mergeNodeDeps: createStubMergeNodeDeps() },
      createCheckpointer(':memory:')
    ).invoke(ctx.initialState(ALL_GATES_ENABLED), ctx.newConfig());
    ctx.reset();
    const wrapped = createStubExecutor();
    await buildGraph(wrapped, null).invoke(ctx.initialState(ALL_GATES_ENABLED), ctx.newConfig());

    const strip = (p: string) => p.replace(/feat-[0-9a-f]{8}/g, 'feat-x');
    expect(calls(wrapped).map((c) => strip(c.prompt))).toEqual(
      calls(plain).map((c) => strip(c.prompt))
    );
    for (const { options } of calls(wrapped)) {
      expect(options?.systemPrompt ?? '').not.toContain(LEARNED_SECTION_TITLE);
      expect(options?.settingsPath).toBeUndefined();
    }
  });
});
