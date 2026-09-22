/**
 * Spec-phase retry budget.
 *
 * executeNode — which runs analyze, requirements, research and plan — called
 * `executor.execute` directly, so one transient API 429/5xx or dropped
 * connection failed the whole feature run, while every implement/merge call
 * already went through retryExecute. It now uses retryExecute's default
 * budget, and keeps failing fast on outcomes a re-run cannot fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeNode } from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import {
  agentTimeoutMessage,
  signalTerminationMessage,
} from '@/infrastructure/services/agents/common/executors/process-stream.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';

function executorFailingWith(...messages: string[]): IAgentExecutor {
  const execute = vi.fn();
  for (const message of messages) execute.mockRejectedValueOnce(new Error(message));
  execute.mockResolvedValue({ result: 'analysis written' });
  return {
    agentType: 'claude-code' as AgentType,
    execute,
    executeStream: vi.fn(),
    supportsFeature: vi.fn(),
  } as unknown as IAgentExecutor;
}

describe('executeNode — spec-phase retries', () => {
  let specDir: string;
  let state: FeatureAgentState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    specDir = mkdtempSync(join(tmpdir(), 'shep-execute-node-retry-'));
    state = {
      featureId: 'feat-1',
      repositoryPath: specDir,
      worktreePath: specDir,
      specDir,
      commitSpecs: true,
      messages: [],
    } as unknown as FeatureAgentState;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(specDir, { recursive: true, force: true });
  });

  it.each([
    ['a rate limit', 'Process exited with code 1: API Error: 429 rate_limit_error'],
    ['an overloaded API', 'API Error: 529 {"type":"overloaded_error"}'],
    ['a dropped connection', 'connect ECONNREFUSED 104.18.6.192:443'],
  ])('completes the phase when the call after %s succeeds', async (_label, message) => {
    const executor = executorFailingWith(message);
    const node = executeNode('analyze', executor, () => 'analyze the repo');

    const pending = node(state);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(result.messages?.[0]).toMatch(/\[analyze\] Complete/);
  });

  it.each([
    ['a timeout', agentTimeoutMessage(1_800_000)],
    ['a signal kill', signalTerminationMessage('SIGKILL', '')],
  ])('fails the phase on the first %s without re-running it', async (_label, message) => {
    const executor = executorFailingWith(message);
    const node = executeNode('analyze', executor, () => 'analyze the repo');

    const pending = node(state);
    const assertion = expect(pending).rejects.toThrow(`[analyze] ${message}`);
    await vi.runAllTimersAsync();
    await assertion;

    expect(executor.execute).toHaveBeenCalledTimes(1);
  });
});
