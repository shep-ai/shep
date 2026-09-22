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
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';
import type { IProcessTreeTerminator } from '@/application/ports/output/services/process-tree-terminator.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { AdmitQueuedFeaturesUseCase } from '@/application/use-cases/features/capacity/admit-queued-features.use-case.js';
import type { AgentRun } from '@/domain/generated/output.js';
import {
  createFakeAgentRunRepository,
  createMockAgentRunRepository,
} from '../../../../helpers/agent-run-repository.fake.js';

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
    findByRunIds: vi.fn().mockResolvedValue([]),
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
  let liveness: { isProcessAlive: ReturnType<typeof vi.fn> };
  let terminator: { terminateTree: ReturnType<typeof vi.fn> };
  let admitQueued: { execute: ReturnType<typeof vi.fn> };
  let logger: ILogger;

  const build = (repo: IAgentRunRepository) =>
    new StopAgentRunUseCase(
      repo,
      mockTimingRepo,
      mockPhaseTimingContext,
      liveness as unknown as IProcessLivenessProbe,
      terminator as unknown as IProcessTreeTerminator,
      admitQueued as unknown as AdmitQueuedFeaturesUseCase,
      logger
    );

  beforeEach(() => {
    mockRepo = createMockAgentRunRepository() as unknown as IAgentRunRepository;
    mockTimingRepo = createMockTimingRepo();
    mockPhaseTimingContext = createMockPhaseTimingContext();
    liveness = { isProcessAlive: vi.fn().mockReturnValue(true) };
    terminator = { terminateTree: vi.fn().mockResolvedValue(undefined) };
    admitQueued = { execute: vi.fn().mockResolvedValue(undefined) };
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    useCase = build(mockRepo);
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
      expect.objectContaining({ error: expect.stringContaining('Stopped by user') }),
      { allowedFrom: expect.not.arrayContaining([AgentRunStatus.completed]) }
    );
  });

  it('terminates the process tree of an alive worker and marks it interrupted', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ pid: 4242, status: AgentRunStatus.running })
    );

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(true);
    expect(liveness.isProcessAlive).toHaveBeenCalledWith(4242);
    expect(terminator.terminateTree).toHaveBeenCalledWith(4242);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-123',
      AgentRunStatus.interrupted,
      expect.objectContaining({ error: 'Stopped by user' }),
      { allowedFrom: expect.not.arrayContaining([AgentRunStatus.completed]) }
    );
  });

  it('never signals the OS directly — process control goes through the port', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeAgentRun({ pid: 4242 }));
    const killSpy = vi.spyOn(process, 'kill');

    try {
      await useCase.execute('run-123');
      expect(killSpy).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });

  it('should mark as interrupted even if process is already dead', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeAgentRun({ pid: 1, status: AgentRunStatus.running })
    );
    liveness.isProcessAlive.mockReturnValue(false);

    const result = await useCase.execute('run-123');

    expect(result.stopped).toBe(true);
    expect(result.reason).toContain('interrupted');
    expect(terminator.terminateTree).not.toHaveBeenCalled();
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'run-123',
      AgentRunStatus.interrupted,
      expect.anything(),
      { allowedFrom: expect.not.arrayContaining([AgentRunStatus.completed]) }
    );
  });

  describe('capacity drain (a stopped run frees its slot)', () => {
    it('admits queued features after a stop', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(makeAgentRun({ pid: 4242 }));

      await useCase.execute('run-123');

      expect(admitQueued.execute).toHaveBeenCalledOnce();
    });

    it('does not drain when nothing was stopped', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(
        makeAgentRun({ status: AgentRunStatus.completed })
      );

      await useCase.execute('run-123');

      expect(admitQueued.execute).not.toHaveBeenCalled();
    });

    it('still reports the stop, and logs, when the drain fails', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(makeAgentRun({ pid: 4242 }));
      admitQueued.execute.mockRejectedValue(new Error('SQLITE_BUSY'));

      const result = await useCase.execute('run-123');

      expect(result.stopped).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('drain'),
        expect.objectContaining({ error: 'SQLITE_BUSY' })
      );
    });
  });

  describe('guarded write (spec 116)', () => {
    it('does not report a run that finished during the stop as stopped', async () => {
      const repo = createFakeAgentRunRepository([
        makeAgentRun({ status: AgentRunStatus.completed, pid: undefined }),
      ]);
      // The read still sees the run running; it completes before the write.
      repo.findById.mockResolvedValueOnce(makeAgentRun({ pid: undefined }));
      const stop = build(repo as unknown as IAgentRunRepository);

      const result = await stop.execute('run-123');

      expect(result.stopped).toBe(false);
      expect(result.reason).toContain('completed');
      expect(repo.peek('run-123')?.status).toBe(AgentRunStatus.completed);
    });

    it('records interrupted before signalling the worker', async () => {
      const order: string[] = [];
      vi.mocked(mockRepo.findById).mockResolvedValue(makeAgentRun({ pid: 4242 }));
      vi.mocked(mockRepo.updateStatus).mockImplementation(async () => {
        order.push('write');
        return true;
      });
      terminator.terminateTree.mockImplementation(async () => {
        order.push('signal');
      });

      await useCase.execute('run-123');

      // The worker's own writes are refused once the run is interrupted, so the
      // stop must land before the worker is told to exit.
      expect(order).toEqual(['write', 'signal']);
    });
  });
});
