import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WorkflowSchedulerService,
  resetWorkflowScheduler,
} from '@shepai/core/infrastructure/services/workflow-scheduler/workflow-scheduler.service.js';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '@shepai/core/application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import type { INotificationService } from '@shepai/core/application/ports/output/services/notification-service.interface.js';
import type { ScheduledWorkflow, WorkflowExecution } from '@shepai/core/domain/generated/output.js';
import {
  NotificationEventType,
  WorkflowExecutionStatus,
  WorkflowTriggerType,
} from '@shepai/core/domain/generated/output.js';

function createMockWorkflowRepo(): IWorkflowRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn().mockResolvedValue(null),
    findEnabled: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockExecutionRepo(): IWorkflowExecutionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByWorkflowId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  };
}

function createMockNotificationService(): INotificationService {
  return { notify: vi.fn() };
}

class MockClock implements IClock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-01-15T10:00:00Z')) {
    this.currentTime = initialTime;
  }

  now(): Date {
    return this.currentTime;
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  set(date: Date): void {
    this.currentTime = date;
  }
}

function createTestWorkflow(overrides?: Partial<ScheduledWorkflow>): ScheduledWorkflow {
  const now = new Date('2026-01-15T10:00:00Z');
  return {
    id: 'wf-1',
    name: 'test-workflow',
    prompt: 'Do something useful',
    enabled: true,
    repositoryPath: '/repo',
    cronExpression: '0 * * * *',
    nextRunAt: new Date('2026-01-15T10:00:00Z'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestExecution(overrides?: Partial<WorkflowExecution>): WorkflowExecution {
  const now = new Date('2026-01-15T10:00:00Z');
  return {
    id: 'exec-1',
    workflowId: 'wf-1',
    triggerType: WorkflowTriggerType.Manual,
    status: WorkflowExecutionStatus.Queued,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('WorkflowSchedulerService', () => {
  let service: WorkflowSchedulerService;
  let workflowRepo: IWorkflowRepository;
  let executionRepo: IWorkflowExecutionRepository;
  let clock: MockClock;
  let notificationService: INotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    workflowRepo = createMockWorkflowRepo();
    executionRepo = createMockExecutionRepo();
    clock = new MockClock();
    notificationService = createMockNotificationService();
    service = new WorkflowSchedulerService(
      workflowRepo,
      executionRepo,
      clock,
      notificationService,
      1000 // 1s poll interval for fast tests
    );
  });

  afterEach(() => {
    service.stop();
    resetWorkflowScheduler();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('start() begins polling and stop() stops it', async () => {
      expect(service.isRunning()).toBe(false);

      await service.start();
      expect(service.isRunning()).toBe(true);

      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('start() is idempotent', async () => {
      await service.start();
      await service.start(); // should not throw or create second interval
      expect(service.isRunning()).toBe(true);
    });
  });

  describe('polling', () => {
    it('queries due workflows and enqueues them', async () => {
      const dueWorkflow = createTestWorkflow({
        nextRunAt: new Date('2026-01-15T09:59:00Z'), // in the past
      });
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([dueWorkflow]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(dueWorkflow);

      await service.start();

      // Wait for the async poll to complete
      await vi.advanceTimersByTimeAsync(100);

      // The workflow should have been found and execution attempted
      expect(workflowRepo.findEnabled).toHaveBeenCalled();
      expect(executionRepo.create).toHaveBeenCalled();
    });

    it('executes one queued workflow per tick', async () => {
      const wf1 = createTestWorkflow({
        id: 'wf-1',
        name: 'wf1',
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });
      const wf2 = createTestWorkflow({
        id: 'wf-2',
        name: 'wf2',
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });

      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([wf1, wf2]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(wf1)
        .mockResolvedValueOnce(wf2);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      // First poll should execute one workflow
      const createCalls = (executionRepo.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.length).toBe(1);
    });
  });

  describe('execution', () => {
    it('creates WorkflowExecution with Running status and updates to Completed', async () => {
      const workflow = createTestWorkflow({
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([workflow]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should have created an execution, then updated it to Running, then to Completed
      const updateCalls = (executionRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      expect(updateCalls.length).toBeGreaterThanOrEqual(2);

      // First update: Running
      expect(updateCalls[0][0].status).toBe(WorkflowExecutionStatus.Running);
      // Second update: Completed
      expect(updateCalls[1][0].status).toBe(WorkflowExecutionStatus.Completed);
    });

    it('updates workflow lastRunAt and recalculates nextRunAt', async () => {
      const workflow = createTestWorkflow({
        cronExpression: '0 * * * *',
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([workflow]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(workflowRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: workflow.id,
          lastRunAt: expect.any(Date),
          nextRunAt: expect.any(Date),
        })
      );
    });
  });

  describe('notifications', () => {
    it('emits WorkflowStarted event at execution start', async () => {
      const workflow = createTestWorkflow({
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([workflow]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: NotificationEventType.WorkflowStarted,
          featureName: 'test-workflow',
        })
      );
    });

    it('emits WorkflowCompleted event on success', async () => {
      const workflow = createTestWorkflow({
        nextRunAt: new Date('2026-01-15T09:00:00Z'),
      });
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([workflow]);
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: NotificationEventType.WorkflowCompleted,
        })
      );
    });
  });

  describe('crash recovery', () => {
    it('marks stale Running executions as Failed on startup', async () => {
      const staleExecution = createTestExecution({
        status: WorkflowExecutionStatus.Running,
      });
      (executionRepo.findByStatus as ReturnType<typeof vi.fn>).mockImplementation(
        (status: WorkflowExecutionStatus) => {
          if (status === WorkflowExecutionStatus.Running) {
            return Promise.resolve([staleExecution]);
          }
          return Promise.resolve([]);
        }
      );

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(executionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: staleExecution.id,
          status: WorkflowExecutionStatus.Failed,
          errorMessage: 'Daemon crashed during execution',
        })
      );
    });
  });

  describe('retention cleanup', () => {
    it('deletes records older than 30 days every 100 ticks', async () => {
      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.start();

      // Fast-forward through 100 polling ticks (each 1s)
      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      expect(executionRepo.deleteOlderThan).toHaveBeenCalledWith(expect.any(Date));

      // Verify the cutoff date is approximately 30 days ago
      const cutoffDate = (executionRepo.deleteOlderThan as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Date;
      const expectedCutoff = clock.now().getTime() - 30 * 24 * 60 * 60 * 1000;
      expect(cutoffDate.getTime()).toBe(expectedCutoff);
    });
  });

  describe('queue management', () => {
    it('processes manually queued executions', async () => {
      const workflow = createTestWorkflow({ nextRunAt: undefined }); // No schedule
      const queuedExec = createTestExecution({
        workflowId: workflow.id,
        status: WorkflowExecutionStatus.Queued,
      });

      (workflowRepo.findEnabled as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (executionRepo.findByStatus as ReturnType<typeof vi.fn>).mockImplementation(
        (status: WorkflowExecutionStatus) => {
          if (status === WorkflowExecutionStatus.Queued) {
            return Promise.resolve([queuedExec]);
          }
          return Promise.resolve([]);
        }
      );
      (workflowRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(workflow);

      await service.start();
      await vi.advanceTimersByTimeAsync(100);

      // Should have processed the queued execution
      expect(executionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkflowExecutionStatus.Running,
        })
      );
    });
  });
});
