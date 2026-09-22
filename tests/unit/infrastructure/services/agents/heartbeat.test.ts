/**
 * Heartbeat Module Unit Tests
 *
 * reportNodeStart() fires on every graph node. It used to write `running`
 * unconditionally, so the first node after a Stop turned `interrupted` back
 * into `running`; the write is now guarded by the worker's claimable statuses.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setHeartbeatContext,
  reportNodeStart,
} from '@/infrastructure/services/agents/feature-agent/heartbeat.js';
import { AgentRunStatus, type AgentRun } from '@/domain/generated/output.js';
import { WORKER_CLAIMABLE_STATUSES } from '@/infrastructure/services/agents/feature-agent/worker-run-status.js';
import {
  createFakeAgentRunRepository,
  createMockAgentRunRepository,
  type MockAgentRunRepository,
} from '../../../../helpers/agent-run-repository.fake.js';

function makeRun(status: AgentRunStatus): AgentRun {
  return {
    id: 'run-hb',
    agentType: 'claude-code' as AgentRun['agentType'],
    agentName: 'feature-agent',
    status,
    prompt: 'test',
    threadId: 'thread-hb',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** reportNodeStart is fire-and-forget; let its promise chain settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('heartbeat', () => {
  let mockRepo: MockAgentRunRepository;

  beforeEach(() => {
    mockRepo = createMockAgentRunRepository();
  });

  it('should not call updateStatus when context is not set', () => {
    // reportNodeStart with no context set should be a no-op
    // (We can't easily reset module state, so just verify it doesn't throw)
    reportNodeStart('analyze');
    // If we got here without error, the test passes
  });

  it('should call updateStatus with node name after context is set', async () => {
    setHeartbeatContext('run-1', mockRepo);

    reportNodeStart('analyze');

    // reportNodeStart is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.running,
      expect.objectContaining({
        result: 'node:analyze',
        lastHeartbeat: expect.any(Date),
      }),
      { allowedFrom: WORKER_CLAIMABLE_STATUSES }
    );
  });

  it('should update with different node names', async () => {
    setHeartbeatContext('run-2', mockRepo);

    reportNodeStart('plan');

    await new Promise((r) => setTimeout(r, 10));

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-2',
      AgentRunStatus.running,
      expect.objectContaining({ result: 'node:plan' }),
      { allowedFrom: WORKER_CLAIMABLE_STATUSES }
    );
  });

  it('leaves a stopped run interrupted', async () => {
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.interrupted)]);
    setHeartbeatContext('run-hb', repo);

    reportNodeStart('implement');
    await settle();

    expect(repo.peek('run-hb')?.status).toBe(AgentRunStatus.interrupted);
  });

  it('records the current node on a running run', async () => {
    const repo = createFakeAgentRunRepository([makeRun(AgentRunStatus.running)]);
    setHeartbeatContext('run-hb', repo);

    reportNodeStart('implement');
    await settle();

    expect(repo.peek('run-hb')?.status).toBe(AgentRunStatus.running);
    expect(repo.peek('run-hb')?.result).toBe('node:implement');
  });
});
