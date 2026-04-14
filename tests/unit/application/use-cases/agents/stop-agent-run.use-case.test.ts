/**
 * StopAgentRunUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StopAgentRunUseCase } from '@/application/use-cases/agents/stop-agent-run.use-case.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';
import type { AgentRun } from '@/domain/generated/output.js';

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = new Date().toISOString();
  return {
    id: 'run-123',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'test prompt',
    threadId: 'thread-1',
    pid: 99999,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockTimingRepo(): IPhaseTimingRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    updateApprovalWait: vi.fn().mockResolvedValue(undefined),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn().mockResolvedValue([]),
  };
}

function createMockPhaseTimingContext(): IPhaseTimingContext {
  return {
    recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('StopAgentRunUseCase', () => {
  let useCase: StopAgentRunUseCase;
  let mockRepo: IAgentRunRepository;
  let mockTimingRepo: IPhaseTimingRepository;
  let mockPhaseTimingContext: IPhaseTimingContext;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
      findRunningByPid: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    mockTimingRepo = createMockTimingRepo();
    mockPhaseTimingContext = createMockPhaseTimingContext();

    useCase = new StopAgentRunUseCase(mockRepo, mockTimingRepo, mockPhaseTimingContext);
  });

  it('should return error if run not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute('nonexistent');

    expect(result.stopped).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should return error if run is already in terminal state', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ status: AgentRunStatus.completed })
    );

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(false);
    expect(result.reason).toContain('terminal state');
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('should interrupt run with no PID', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ pid: undefined, status: AgentRunStatus.pending })
    );

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(true);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-123',
      AgentRunStatus.interrupted,
      expect.objectContaining({ error: expect.stringContaining('Stopped by user') })
    );
  });

  it('should send SIGTERM to alive process and mark as interrupted', async () => {
    // Use our own PID which we know is alive
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ pid: process.pid, status: AgentRunStatus.running })
    );
    // Spy on process.kill to prevent actually signaling ourselves
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(true);
    expect(result.reason).toContain('SIGTERM');
    // First call: kill(pid, 0) for liveness check, second: kill(pid, 'SIGTERM')
    expect(killSpy).toHaveBeenCalledWith(process.pid, 0);
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-123',
      AgentRunStatus.interrupted,
      expect.objectContaining({ error: 'Stopped by user' })
    );
  });

  it('should mark as interrupted even if process is already dead', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ pid: 1, status: AgentRunStatus.running })
    );
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(true);
    expect(result.reason).toContain('interrupted');
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-123',
      AgentRunStatus.interrupted,
      expect.anything()
    );
  });
});
