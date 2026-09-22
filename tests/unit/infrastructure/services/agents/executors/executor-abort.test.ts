/**
 * Every subprocess executor honours `AgentExecutionOptions.abortSignal`.
 *
 * The implement node runs a parallel phase's tasks concurrently. When one
 * failed, nothing could stop the others: their agent CLIs kept running (and
 * spending tokens) in the worktree after the run was already lost. An abort
 * terminates the agent, and `execute()` rejects only once the process has
 * actually closed — so a caller that awaits it has awaited the teardown.
 *
 * One parameterised suite rather than seven copies: the contract is identical
 * for every CLI, and so is the shared helper that implements it.
 */

import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';
import type {
  IAgentExecutor,
  AgentExecutionStreamEvent,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { ClaudeCodeExecutorService } from '@/infrastructure/services/agents/common/executors/claude-code-executor.service.js';
import { CodexCliExecutorService } from '@/infrastructure/services/agents/common/executors/codex-cli-executor.service.js';
import { CopilotCliExecutorService } from '@/infrastructure/services/agents/common/executors/copilot-cli-executor.service.js';
import { CursorExecutorService } from '@/infrastructure/services/agents/common/executors/cursor-executor.service.js';
import { GeminiCliExecutorService } from '@/infrastructure/services/agents/common/executors/gemini-cli-executor.service.js';
import { KimiCodeExecutorService } from '@/infrastructure/services/agents/common/executors/kimi-code-executor.service.js';
import { ClineExecutorService } from '@/infrastructure/services/agents/common/executors/cline-executor.service.js';
import { classifyError } from '@/infrastructure/services/agents/feature-agent/nodes/agent-retry.js';

const ABORTED = /aborted/i;

/** A child process that stays alive until the test closes it. */
class FakeChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn(), once: vi.fn() };
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
  /** What the OS does once the signal lands. */
  closeFromSignal(): void {
    this.emit('close', null, 'SIGTERM');
  }
}

type ExecutorFactory = (spawn: SpawnFunction) => IAgentExecutor;

const EXECUTORS: [string, ExecutorFactory][] = [
  ['claude-code', (spawn) => new ClaudeCodeExecutorService(spawn)],
  ['codex-cli', (spawn) => new CodexCliExecutorService(spawn)],
  ['copilot-cli', (spawn) => new CopilotCliExecutorService(spawn)],
  ['cursor', (spawn) => new CursorExecutorService(spawn)],
  ['gemini-cli', (spawn) => new GeminiCliExecutorService(spawn)],
  ['kimi-code', (spawn) => new KimiCodeExecutorService(spawn)],
  ['cline', (spawn) => new ClineExecutorService(spawn)],
];

function setup(factory: ExecutorFactory): { executor: IAgentExecutor; children: FakeChild[] } {
  const children: FakeChild[] = [];
  const spawn = vi.fn(() => {
    const child = new FakeChild();
    children.push(child);
    return child as unknown as ChildProcess;
  }) as unknown as SpawnFunction;
  return { executor: factory(spawn), children };
}

/** The agent child — the last one spawned (some executors probe first). */
async function agentChild(children: FakeChild[]): Promise<FakeChild> {
  await vi.waitFor(() => expect(children.length).toBeGreaterThan(0));
  return children[children.length - 1];
}

describe.each(EXECUTORS)('%s executor — abortSignal', (_name, factory) => {
  it('execute(): terminates the agent and rejects as aborted once it has closed', async () => {
    const { executor, children } = setup(factory);
    const controller = new AbortController();
    let settled = false;
    const run = executor
      .execute('do the task', { abortSignal: controller.signal, silent: true })
      .finally(() => {
        settled = true;
      });
    const child = await agentChild(children);

    controller.abort();

    expect(child.kill).toHaveBeenCalled();
    // Still waiting: the promise is the caller's handle on the teardown.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    child.closeFromSignal();
    await expect(run).rejects.toThrow(ABORTED);
  });

  it('execute(): an already-aborted signal terminates the agent at once', async () => {
    const { executor, children } = setup(factory);
    const controller = new AbortController();
    controller.abort();

    const run = executor.execute('do the task', { abortSignal: controller.signal, silent: true });
    const child = await agentChild(children);

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
    child.closeFromSignal();
    await expect(run).rejects.toThrow(ABORTED);
  });

  it('executeStream(): terminates the agent and ends with an aborted error event', async () => {
    const { executor, children } = setup(factory);
    const controller = new AbortController();
    const events: AgentExecutionStreamEvent[] = [];

    const consume = (async () => {
      for await (const event of executor.executeStream('do the task', {
        abortSignal: controller.signal,
        silent: true,
      })) {
        events.push(event);
      }
    })();
    const child = await agentChild(children);

    controller.abort();
    child.closeFromSignal();
    await consume;

    expect(child.kill).toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: 'error', content: expect.stringMatching(ABORTED) });
  });
});

describe('abort classification', () => {
  it('never retries an aborted turn — the caller asked it to stop', async () => {
    const { executor, children } = setup(EXECUTORS[0][1]);
    const controller = new AbortController();
    const run = executor.execute('x', { abortSignal: controller.signal, silent: true });
    const child = await agentChild(children);
    controller.abort();
    child.closeFromSignal();
    const error = await run.catch((e: Error) => e);

    expect(classifyError((error as Error).message)).toBe('non-retryable');
  });
});
