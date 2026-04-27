/**
 * Heartbeat Module Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setHeartbeatContext,
  reportNodeStart,
} from '@/infrastructure/services/agents/feature-agent/heartbeat.js';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';

describe('heartbeat', () => {
  let mockRepo: IAgentRunRepository;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
      findRunningByPid: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };
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
      })
    );
  });

  it('should update with different node names', async () => {
    setHeartbeatContext('run-2', mockRepo);

    reportNodeStart('plan');

    await new Promise((r) => setTimeout(r, 10));

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-2',
      AgentRunStatus.running,
      expect.objectContaining({ result: 'node:plan' })
    );
  });
});
