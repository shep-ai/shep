/**
 * DeleteAgentRunUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteAgentRunUseCase } from '@/application/use-cases/agents/delete-agent-run.use-case.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { AgentRun } from '@/domain/generated/output.js';

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = new Date().toISOString();
  return {
    id: 'run-123',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.completed,
    prompt: 'test prompt',
    threadId: 'thread-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('DeleteAgentRunUseCase', () => {
  let useCase: DeleteAgentRunUseCase;
  let mockRepo: IAgentRunRepository;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn().mockResolvedValue(null),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
      findRunningByPid: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new DeleteAgentRunUseCase(mockRepo);
  });

  it('should return error if run not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute('nonexistent');

    expect(result.deleted).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should refuse to delete a running agent', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ status: AgentRunStatus.running })
    );

    const result = await useCase.execute('run-123');

    expect(result.deleted).toBe(false);
    expect(result.reason).toContain('Cannot delete a running agent');
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('should delete a completed agent run', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ status: AgentRunStatus.completed })
    );

    const result = await useCase.execute('run-123');

    expect(result.deleted).toBe(true);
    expect(mockRepo.delete).toHaveBeenCalledWith('run-123');
  });

  it('should delete a failed agent run', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeAgentRun({ status: AgentRunStatus.failed }));

    const result = await useCase.execute('run-123');

    expect(result.deleted).toBe(true);
    expect(mockRepo.delete).toHaveBeenCalledWith('run-123');
  });

  it('should delete a cancelled agent run', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ status: AgentRunStatus.cancelled })
    );

    const result = await useCase.execute('run-123');

    expect(result.deleted).toBe(true);
    expect(mockRepo.delete).toHaveBeenCalledWith('run-123');
  });
});
