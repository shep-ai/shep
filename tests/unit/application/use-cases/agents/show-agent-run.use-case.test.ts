/**
 * ShowAgentRunUseCase Unit Tests
 *
 * Tests for retrieving a single agent run by ID with liveness check.
 * Uses mock repository and mock process service.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShowAgentRunUseCase } from '@/application/use-cases/agents/show-agent-run.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';

function createMockAgentRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'abcd1234-5678-9abc-def0-123456789abc',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'Implement feature X',
    threadId: 'thread-1',
    pid: 12345,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe('ShowAgentRunUseCase', () => {
  let useCase: ShowAgentRunUseCase;
  let mockRepo: IAgentRunRepository;
  let mockProcessService: IFeatureAgentProcessService;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockAgentRun()),
      findByThreadId: vi.fn(),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
      updatePinnedConfig: vi.fn(),
      findRunningByPid: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    };
    mockProcessService = {
      spawn: vi.fn(),
      isAlive: vi.fn().mockReturnValue(true),
      checkAndMarkCrashed: vi.fn(),
    };
    useCase = new ShowAgentRunUseCase(mockRepo, mockProcessService);
  });

  it('should return agent run by exact ID', async () => {
    const result = await useCase.execute('abcd1234-5678-9abc-def0-123456789abc');
    expect(result.run.id).toBe('abcd1234-5678-9abc-def0-123456789abc');
    expect(mockRepo.findById).toHaveBeenCalledWith('abcd1234-5678-9abc-def0-123456789abc');
  });

  it('should fall back to prefix match when exact match fails', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.list = vi
      .fn()
      .mockResolvedValue([
        createMockAgentRun({ id: 'abcd1234-full-uuid' }),
        createMockAgentRun({ id: 'efgh5678-other-uuid' }),
      ]);

    const result = await useCase.execute('abcd1234');
    expect(result.run.id).toBe('abcd1234-full-uuid');
  });

  it('should throw if run not found by ID or prefix', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.list = vi.fn().mockResolvedValue([]);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
  });

  it('should include run ID in error message', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.list = vi.fn().mockResolvedValue([]);

    await expect(useCase.execute('abc-123')).rejects.toThrow('abc-123');
  });

  it('should check process liveness for runs with a pid', async () => {
    mockProcessService.isAlive = vi.fn().mockReturnValue(true);

    const result = await useCase.execute('abcd1234-5678-9abc-def0-123456789abc');
    expect(result.isAlive).toBe(true);
    expect(mockProcessService.isAlive).toHaveBeenCalledWith(12345);
  });

  it('should return isAlive false when process is dead', async () => {
    mockProcessService.isAlive = vi.fn().mockReturnValue(false);

    const result = await useCase.execute('abcd1234-5678-9abc-def0-123456789abc');
    expect(result.isAlive).toBe(false);
  });

  it('should return isAlive false when run has no pid', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(createMockAgentRun({ pid: undefined }));

    const result = await useCase.execute('abcd1234-5678-9abc-def0-123456789abc');
    expect(result.isAlive).toBe(false);
    expect(mockProcessService.isAlive).not.toHaveBeenCalled();
  });

  it('should not call prefix match if exact match succeeds', async () => {
    await useCase.execute('abcd1234-5678-9abc-def0-123456789abc');
    expect(mockRepo.list).not.toHaveBeenCalled();
  });
});
