/**
 * ListAgentRunsUseCase Unit Tests
 *
 * Tests for listing agent runs sorted by most recent first.
 * Uses mock repository.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAgentRunsUseCase } from '@/application/use-cases/agents/list-agent-runs.use-case.js';
import type { ReconcileAgentRunLivenessUseCase } from '@/application/use-cases/agents/reconcile-agent-run-liveness.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';

function createMockAgentRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'Implement feature X',
    threadId: 'thread-1',
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe('ListAgentRunsUseCase', () => {
  const livenessSweep = { execute: vi.fn() };
  const sweep = livenessSweep as unknown as ReconcileAgentRunLivenessUseCase;
  let useCase: ListAgentRunsUseCase;
  let mockRepo: IAgentRunRepository;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByThreadId: vi.fn(),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
      updatePinnedConfig: vi.fn(),
      findRunningByPid: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    };
    useCase = new ListAgentRunsUseCase(mockRepo, sweep);
  });

  it('should list all agent runs', async () => {
    mockRepo.list = vi
      .fn()
      .mockResolvedValue([
        createMockAgentRun({ id: 'run-1' }),
        createMockAgentRun({ id: 'run-2' }),
      ]);
    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(mockRepo.list).toHaveBeenCalled();
  });

  it('should return empty array when no runs exist', async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('should sort runs by createdAt descending (most recent first)', async () => {
    mockRepo.list = vi
      .fn()
      .mockResolvedValue([
        createMockAgentRun({ id: 'run-old', createdAt: new Date('2025-01-01T08:00:00Z') }),
        createMockAgentRun({ id: 'run-new', createdAt: new Date('2025-01-01T12:00:00Z') }),
        createMockAgentRun({ id: 'run-mid', createdAt: new Date('2025-01-01T10:00:00Z') }),
      ]);

    const result = await useCase.execute();
    expect(result[0].id).toBe('run-new');
    expect(result[1].id).toBe('run-mid');
    expect(result[2].id).toBe('run-old');
  });

  it('should handle string date values for sorting', async () => {
    mockRepo.list = vi
      .fn()
      .mockResolvedValue([
        createMockAgentRun({ id: 'run-old', createdAt: '2025-01-01T08:00:00Z' }),
        createMockAgentRun({ id: 'run-new', createdAt: '2025-01-01T12:00:00Z' }),
      ]);

    const result = await useCase.execute();
    expect(result[0].id).toBe('run-new');
    expect(result[1].id).toBe('run-old');
  });

  // The read paths every surface uses (CLI, TUI, web) run the run-liveness
  // sweep first, so what they return already reflects a crashed or hung worker.
  describe('run-liveness sweep', () => {
    it('reconciles run liveness before reading', async () => {
      const order: string[] = [];
      livenessSweep.execute.mockImplementation(async () => {
        order.push('sweep');
        return { reconciledRunIds: [] };
      });
      mockRepo.list = vi.fn(async () => {
        order.push('read');
        return [];
      });

      await useCase.execute();

      expect(order).toEqual(['sweep', 'read']);
    });
  });
});
