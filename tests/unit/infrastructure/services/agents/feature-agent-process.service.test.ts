/**
 * FeatureAgentProcessService Unit Tests
 *
 * Tests for background process management: spawning workers via fork(),
 * checking process liveness, and marking crashed processes.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';

// Use vi.hoisted so mock fn is available when vi.mock factory runs
const { mockFork, mockIsWindows } = vi.hoisted(() => ({
  mockFork: vi.fn(),
  mockIsWindows: { value: false },
}));

vi.mock(import('node:child_process'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual, fork: (...args: unknown[]) => mockFork(...args) },
    fork: (...args: unknown[]) => mockFork(...args),
  };
});

vi.mock('@/infrastructure/platform.js', () => ({
  get IS_WINDOWS() {
    return mockIsWindows.value;
  },
}));

import { FeatureAgentProcessService } from '@/infrastructure/services/agents/feature-agent/feature-agent-process.service.js';

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = new Date().toISOString();
  return {
    id: 'run-123',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'Run feature agent',
    threadId: 'thread-abc',
    pid: 1234,
    featureId: 'feat-456',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('FeatureAgentProcessService', () => {
  let service: FeatureAgentProcessService;
  let mockRunRepository: IAgentRunRepository;
  let mockChildProcess: {
    pid: number;
    unref: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFork.mockReset();

    mockChildProcess = {
      pid: 9999,
      unref: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    mockFork.mockReturnValue(mockChildProcess);

    mockRunRepository = {
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

    service = new FeatureAgentProcessService(mockRunRepository);
  });

  describe('spawn', () => {
    it('should fork a worker process and return its PID', () => {
      const pid = service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      expect(pid).toBe(9999);
      expect(mockFork).toHaveBeenCalledTimes(1);
    });

    it('should pass feature-id, run-id, repo, and spec-dir as CLI args', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      const args = mockFork.mock.calls[0][1];
      expect(args).toContain('--feature-id');
      expect(args).toContain('feat-1');
      expect(args).toContain('--run-id');
      expect(args).toContain('run-1');
      expect(args).toContain('--repo');
      expect(args).toContain('/repo');
      expect(args).toContain('--spec-dir');
      expect(args).toContain('/repo/specs/001');
    });

    it('should fork with detached mode and log file stdio', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      const options = mockFork.mock.calls[0][2];
      expect(options).toMatchObject({ detached: true });
      // stdio should be an array with [ignore, logFd, logFd, ipc]
      expect(options.stdio).toEqual(expect.arrayContaining(['ignore', 'ipc']));
    });

    it('should disconnect IPC and unref to allow parent to exit independently', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      expect(mockChildProcess.disconnect).toHaveBeenCalledTimes(1);
      expect(mockChildProcess.unref).toHaveBeenCalledTimes(1);
    });

    it('should include --agent-type in fork args when agentType option is set', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001', undefined, {
        agentType: AgentType.ClaudeCode,
      });

      const args = mockFork.mock.calls[0][1];
      expect(args).toContain('--agent-type');
      expect(args).toContain('claude-code');
    });

    it('should NOT include --agent-type in fork args when agentType option is not set', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001', undefined, {
        resume: true,
      });

      const args = mockFork.mock.calls[0][1];
      expect(args).not.toContain('--agent-type');
    });

    it('should include --model in fork args when model option is set', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001', undefined, {
        model: 'claude-haiku-4-5',
      });

      const args = mockFork.mock.calls[0][1];
      expect(args).toContain('--model');
      expect(args).toContain('claude-haiku-4-5');
    });

    it('should NOT include --model in fork args when model option is not set', () => {
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      const args = mockFork.mock.calls[0][1];
      expect(args).not.toContain('--model');
    });

    it('should throw if fork returns no pid', () => {
      mockFork.mockReturnValue({ ...mockChildProcess, pid: undefined });

      expect(() => {
        service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');
      }).toThrow('Failed to spawn feature agent worker');
    });

    it('should include windowsHide: true in fork options on Windows', () => {
      mockIsWindows.value = true;
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      const options = mockFork.mock.calls[0][2];
      expect(options).toMatchObject({ windowsHide: true });
      mockIsWindows.value = false;
    });

    it('should NOT include windowsHide in fork options on non-Windows', () => {
      mockIsWindows.value = false;
      service.spawn('feat-1', 'run-1', '/repo', '/repo/specs/001');

      const options = mockFork.mock.calls[0][2];
      expect(options).not.toHaveProperty('windowsHide');
    });
  });

  describe('isAlive', () => {
    it('should return true for a running process', () => {
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      expect(service.isAlive(1234)).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(1234, 0);
    });

    it('should return false for a dead process', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(service.isAlive(1234)).toBe(false);
    });
  });

  describe('checkAndMarkCrashed', () => {
    it('should mark a dead process as interrupted', async () => {
      const run = makeAgentRun({ id: 'run-dead', pid: 5555, status: AgentRunStatus.running });
      vi.mocked(mockRunRepository.findById).mockResolvedValue(run);
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      await service.checkAndMarkCrashed('run-dead');

      expect(mockRunRepository.updateStatus).toHaveBeenCalledWith(
        'run-dead',
        AgentRunStatus.interrupted,
        expect.objectContaining({
          error: expect.stringContaining('crashed'),
        })
      );
    });

    it('should not update if process is still alive', async () => {
      const run = makeAgentRun({ id: 'run-alive', pid: 7777, status: AgentRunStatus.running });
      vi.mocked(mockRunRepository.findById).mockResolvedValue(run);
      vi.spyOn(process, 'kill').mockReturnValue(true);

      await service.checkAndMarkCrashed('run-alive');

      expect(mockRunRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should not update if run is not found', async () => {
      vi.mocked(mockRunRepository.findById).mockResolvedValue(null);

      await service.checkAndMarkCrashed('run-missing');

      expect(mockRunRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should not update if run has no PID', async () => {
      const run = makeAgentRun({
        id: 'run-no-pid',
        pid: undefined,
        status: AgentRunStatus.running,
      });
      vi.mocked(mockRunRepository.findById).mockResolvedValue(run);

      await service.checkAndMarkCrashed('run-no-pid');

      expect(mockRunRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should not update if run is already in a terminal state', async () => {
      const run = makeAgentRun({ id: 'run-done', pid: 8888, status: AgentRunStatus.completed });
      vi.mocked(mockRunRepository.findById).mockResolvedValue(run);

      await service.checkAndMarkCrashed('run-done');

      expect(mockRunRepository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
