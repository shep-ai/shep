/**
 * Supervisor LangGraph workflow — unit tests
 *
 * Verifies the happy path with a stubbed executor, the 25s timeout
 * fallback (verdict='escalate', rationale='timeout'), and that the
 * graph snapshots modelId / promptVersion onto every produced
 * decision.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  AgentFeature,
  AgentType,
  SupervisorAutonomy,
  SupervisorVerdict,
  type SupervisorPolicy,
} from '@/domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionResult,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import { createSupervisorAgent } from '@/infrastructure/services/agents/supervisor-agent/supervisor-graph.js';
import { SUPERVISOR_EVALUATOR_PROMPT_VERSION } from '@/infrastructure/services/agents/supervisor-agent/evaluator-prompt.js';
import type { SupervisorGateEvent } from '@/application/ports/output/agents/supervisor-agent.interface.js';
import { agentTimeoutMessage } from '@/infrastructure/services/agents/common/executors/process-stream.js';

function makePolicy(overrides: Partial<SupervisorPolicy> = {}): SupervisorPolicy {
  const now = new Date();
  return {
    id: 'pol-1',
    scopeType: 'app',
    scopeId: 'app-1',
    enabled: true,
    autonomyLevel: SupervisorAutonomy.advisory,
    modelId: 'claude-sonnet-4-6',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SupervisorPolicy;
}

function makeStubExecutor(result: string | Error, delayMs = 0): IAgentExecutor {
  return {
    agentType: AgentType.ClaudeCode,
    async execute(): Promise<AgentExecutionResult> {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (result instanceof Error) throw result;
      return { result };
    },
    executeStream(): AsyncIterable<never> {
      throw new Error('not used in supervisor graph tests');
    },
    supportsFeature(feature: AgentFeature): boolean {
      return feature !== AgentFeature.streaming;
    },
  };
}

function gateEvent(): SupervisorGateEvent {
  return {
    kind: 'gate',
    scopeType: 'app',
    scopeId: 'app-1',
    agentRunId: 'run-1',
    gateId: 'plan',
    sourceEventId: 'gate-1',
  };
}

describe('createSupervisorAgent (LangGraph workflow)', () => {
  it('happy path: executor verdict is parsed and audit metadata is snapshotted', async () => {
    const executor = makeStubExecutor('verdict: advise\nLooks reasonable.');
    const agent = createSupervisorAgent({ executor });

    const decision = await agent.evaluate({
      event: gateEvent(),
      policy: makePolicy({ modelId: 'opus-4-7' }),
    });

    expect(decision.verdict).toBe(SupervisorVerdict.advise);
    expect(decision.rationale).toContain('Looks reasonable');
    expect(decision.modelId).toBe('opus-4-7');
    expect(decision.promptVersion).toBe(SUPERVISOR_EVALUATOR_PROMPT_VERSION);
  });

  it('parses approve verdict from executor output', async () => {
    const executor = makeStubExecutor('verdict: approve — diff is trivial.');
    const agent = createSupervisorAgent({ executor });
    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.approve);
  });

  it('parses reject verdict from executor output', async () => {
    const executor = makeStubExecutor('verdict: reject — destructive change.');
    const agent = createSupervisorAgent({ executor });
    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.reject);
  });

  it('does NOT approve when a rejection\'s rationale mentions "verdict: approve"', async () => {
    // Regression: the gate evaluator auto-approves an agent run on an
    // `approve` verdict, so a rejection that quotes the word must not parse
    // as approval.
    const executor = makeStubExecutor(
      'I cannot give verdict: approve here.\nverdict: reject — the migration drops a table'
    );
    const agent = createSupervisorAgent({ executor });
    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.reject);
  });

  it('escalates when the executor emits two conflicting verdict lines', async () => {
    const executor = makeStubExecutor('verdict: approve\nverdict: reject');
    const agent = createSupervisorAgent({ executor });
    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.escalate);
  });

  it('falls back to advise when the executor output omits a verdict line', async () => {
    const executor = makeStubExecutor('I have no opinion.');
    const agent = createSupervisorAgent({ executor });
    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.advise);
  });

  it('on evaluator timeout publishes an escalate verdict with rationale="timeout"', async () => {
    vi.useFakeTimers();
    try {
      // Executor sleeps for 1 minute; timeout is 25ms.
      const executor = makeStubExecutor('verdict: approve\nshould never see this', 60_000);
      const agent = createSupervisorAgent({ executor, evaluatorTimeoutMs: 25 });

      const evaluatePromise = agent.evaluate({ event: gateEvent(), policy: makePolicy() });
      // Advance virtual time past both the timeout and the executor delay so
      // the race resolves deterministically.
      await vi.advanceTimersByTimeAsync(30);
      const decision = await evaluatePromise;

      expect(decision.verdict).toBe(SupervisorVerdict.escalate);
      expect(decision.rationale).toBe('timeout');
      expect(decision.promptVersion).toBe(SUPERVISOR_EVALUATOR_PROMPT_VERSION);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes its time budget to the executor so the agent process is killed, not orphaned', async () => {
    // withTimeout only stops WAITING: without `timeout` in the options the
    // executor never armed its own timer, so the evaluator subprocess kept
    // running (and billing) after the graph had moved on.
    const execute = vi.fn().mockResolvedValue({ result: 'verdict: advise\nfine' });
    const executor = { ...makeStubExecutor('unused'), execute };
    const agent = createSupervisorAgent({ executor, evaluatorTimeoutMs: 1_234 });

    await agent.evaluate({ event: gateEvent(), policy: makePolicy() });

    expect(execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 1_234 })
    );
  });

  it("treats the executor's own timeout as the evaluator timing out", async () => {
    // With the budget passed through, the executor's timer can fire first —
    // that must still take the fail-safe escalate path, not fail the gate.
    const executor = makeStubExecutor(new Error(agentTimeoutMessage(25)));
    const agent = createSupervisorAgent({ executor, evaluatorTimeoutMs: 25 });

    const decision = await agent.evaluate({ event: gateEvent(), policy: makePolicy() });

    expect(decision.verdict).toBe(SupervisorVerdict.escalate);
    expect(decision.rationale).toBe('timeout');
  });

  it('uses fallback model id when policy.modelId is unset', async () => {
    const executor = makeStubExecutor('verdict: advise\nfine');
    const agent = createSupervisorAgent({ executor, defaultModelId: 'fallback-model' });
    const decision = await agent.evaluate({
      event: gateEvent(),
      policy: makePolicy({ modelId: undefined }),
    });
    expect(decision.modelId).toBe('fallback-model');
  });

  it('propagates non-timeout executor errors', async () => {
    const executor = makeStubExecutor(new Error('upstream model unavailable'));
    const agent = createSupervisorAgent({ executor });
    await expect(agent.evaluate({ event: gateEvent(), policy: makePolicy() })).rejects.toThrow(
      'upstream model unavailable'
    );
  });

  it('uses promptResolver override for the evaluator system header when supplied (FR-36)', async () => {
    const seenPrompts: string[] = [];
    const executor: IAgentExecutor = {
      agentType: AgentType.ClaudeCode,
      async execute(prompt: string): Promise<AgentExecutionResult> {
        seenPrompts.push(prompt);
        return { result: 'verdict: advise\nfine' };
      },
      executeStream(): AsyncIterable<never> {
        throw new Error('not used');
      },
      supportsFeature(feature: AgentFeature): boolean {
        return feature !== AgentFeature.streaming;
      },
    };
    const customHeader = 'CUSTOM EVALUATOR HEADER FOR TEST';
    const promptResolver = {
      async resolve(agentType: string, promptId: string, _fallback: string): Promise<string> {
        if (agentType === 'supervisor-agent' && promptId === 'evaluator.system') {
          return customHeader;
        }
        return _fallback;
      },
    };
    const agent = createSupervisorAgent({ executor, promptResolver });
    await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]).toContain(customHeader);
    expect(seenPrompts[0]).not.toContain('You are a delegated supervisor agent');
  });

  it('falls back to bundled header when no resolver is supplied', async () => {
    const seenPrompts: string[] = [];
    const executor: IAgentExecutor = {
      agentType: AgentType.ClaudeCode,
      async execute(prompt: string): Promise<AgentExecutionResult> {
        seenPrompts.push(prompt);
        return { result: 'verdict: advise\nfine' };
      },
      executeStream(): AsyncIterable<never> {
        throw new Error('not used');
      },
      supportsFeature(feature: AgentFeature): boolean {
        return feature !== AgentFeature.streaming;
      },
    };
    const agent = createSupervisorAgent({ executor });
    await agent.evaluate({ event: gateEvent(), policy: makePolicy() });
    expect(seenPrompts[0]).toContain('You are a delegated supervisor agent');
  });
});
