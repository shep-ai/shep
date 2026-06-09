/**
 * Workflow Scheduler Service
 *
 * Polls for due scheduled workflows and executes them sequentially.
 * Follows the NotificationWatcherService/PrSyncWatcherService pattern:
 * - Singleton with start()/stop()/isRunning() lifecycle
 * - setInterval-based polling
 * - Immediate first poll on start()
 * - Graceful shutdown via clearInterval
 *
 * Uses IClock for all time operations (deterministic testing).
 * Uses croner only for validation and nextRun() calculation.
 *
 * Each tick:
 * 1. Query enabled workflows where nextRunAt <= clock.now()
 * 2. Enqueue due workflows into FIFO queue
 * 3. If no execution is running, dequeue and execute next
 * 4. Every 100 ticks: run retention cleanup
 *
 * Crash recovery on startup:
 * - Mark stale 'running' executions as 'failed'
 * - Recalculate nextRunAt for all enabled workflows
 */

import { randomUUID } from 'node:crypto';
import type {
  NotificationEvent,
  ScheduledWorkflow,
  WorkflowExecution,
} from '../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
  WorkflowExecutionStatus,
  WorkflowTriggerType,
} from '../../../domain/generated/output.js';
import type { IWorkflowRepository } from '../../../application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '../../../application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '../../../application/ports/output/services/clock.interface.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';
import { calculateNextRunAt } from '../../../application/use-cases/scheduled-workflows/cron-helpers.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const RETENTION_CLEANUP_INTERVAL_TICKS = 100;
const DEFAULT_RETENTION_DAYS = 30;

export class WorkflowSchedulerService {
  private readonly workflowRepo: IWorkflowRepository;
  private readonly executionRepo: IWorkflowExecutionRepository;
  private readonly clock: IClock;
  private readonly notificationService: INotificationService;
  private readonly pollIntervalMs: number;
  private readonly retentionDays: number;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private isExecuting = false;
  private readonly queue: string[] = []; // workflow IDs

  constructor(
    workflowRepo: IWorkflowRepository,
    executionRepo: IWorkflowExecutionRepository,
    clock: IClock,
    notificationService: INotificationService,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    retentionDays: number = DEFAULT_RETENTION_DAYS
  ) {
    this.workflowRepo = workflowRepo;
    this.executionRepo = executionRepo;
    this.clock = clock;
    this.notificationService = notificationService;
    this.pollIntervalMs = pollIntervalMs;
    this.retentionDays = retentionDays;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  async start(): Promise<void> {
    if (this.intervalId !== null) return;

    // Crash recovery: mark stale 'running' executions as 'failed'
    await this.recoverStaleExecutions();

    // Run first poll immediately
    void this.poll();

    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      this.tickCount++;

      // Find due workflows
      const enabledWorkflows = await this.workflowRepo.findEnabled();
      const now = this.clock.now();

      for (const workflow of enabledWorkflows) {
        if (
          workflow.nextRunAt &&
          new Date(workflow.nextRunAt).getTime() <= now.getTime() &&
          !this.queue.includes(workflow.id)
        ) {
          this.queue.push(workflow.id);
        }
      }

      // Also process any manually queued executions
      const queuedExecutions = await this.executionRepo.findByStatus(
        WorkflowExecutionStatus.Queued
      );
      for (const execution of queuedExecutions) {
        if (!this.queue.includes(execution.workflowId)) {
          this.queue.push(execution.workflowId);
        }
      }

      // Execute one queued workflow if nothing is running
      if (!this.isExecuting && this.queue.length > 0) {
        const workflowId = this.queue.shift()!;
        void this.executeWorkflow(workflowId, queuedExecutions);
      }

      // Retention cleanup every N ticks
      if (this.tickCount % RETENTION_CLEANUP_INTERVAL_TICKS === 0) {
        await this.runRetentionCleanup();
      }
    } catch {
      // DB not ready or query failed — skip this poll cycle
    }
  }

  private async executeWorkflow(
    workflowId: string,
    existingQueuedExecutions: WorkflowExecution[]
  ): Promise<void> {
    this.isExecuting = true;

    try {
      const workflow = await this.workflowRepo.findById(workflowId);
      if (!workflow) {
        this.isExecuting = false;
        return;
      }

      // Find or create execution record
      let execution = existingQueuedExecutions.find(
        (e) => e.workflowId === workflowId && e.status === WorkflowExecutionStatus.Queued
      );

      const now = this.clock.now();

      if (!execution) {
        // Create execution record for scheduled trigger
        execution = {
          id: randomUUID(),
          workflowId,
          triggerType: WorkflowTriggerType.Scheduled,
          status: WorkflowExecutionStatus.Queued,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        await this.executionRepo.create(execution);
      }

      // Transition to Running
      execution = {
        ...execution,
        status: WorkflowExecutionStatus.Running,
        startedAt: now,
        updatedAt: now,
      };
      await this.executionRepo.update(execution);

      // Emit WorkflowStarted event
      this.emitNotification(
        NotificationEventType.WorkflowStarted,
        NotificationSeverity.Info,
        workflow,
        execution,
        `Workflow "${workflow.name}" started`
      );

      try {
        // Execute the workflow prompt
        // For now, this is a placeholder — the actual agent execution
        // will be wired in via the CLI/daemon integration (Phase 4).
        // The scheduler creates the record and manages state transitions.
        // Agent execution would happen here via IAgentRunner.

        const completedAt = this.clock.now();
        const durationMs = completedAt.getTime() - now.getTime();

        // Mark as completed
        execution = {
          ...execution,
          status: WorkflowExecutionStatus.Completed,
          completedAt,
          durationMs,
          updatedAt: completedAt,
        };
        await this.executionRepo.update(execution);

        // Emit WorkflowCompleted event
        this.emitNotification(
          NotificationEventType.WorkflowCompleted,
          NotificationSeverity.Success,
          workflow,
          execution,
          `Workflow "${workflow.name}" completed successfully`
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedAt = this.clock.now();

        execution = {
          ...execution,
          status: WorkflowExecutionStatus.Failed,
          completedAt: failedAt,
          durationMs: failedAt.getTime() - now.getTime(),
          errorMessage,
          updatedAt: failedAt,
        };
        await this.executionRepo.update(execution);

        // Emit WorkflowFailed event
        this.emitNotification(
          NotificationEventType.WorkflowFailed,
          NotificationSeverity.Error,
          workflow,
          execution,
          `Workflow "${workflow.name}" failed: ${errorMessage}`
        );
      }

      // Update workflow lastRunAt and recalculate nextRunAt
      const updateNow = this.clock.now();
      const updatedWorkflow: ScheduledWorkflow = {
        ...workflow,
        lastRunAt: updateNow,
        updatedAt: updateNow,
      };

      if (workflow.cronExpression && workflow.enabled) {
        const nextRunAt = calculateNextRunAt(workflow.cronExpression, workflow.timezone, updateNow);
        updatedWorkflow.nextRunAt = nextRunAt ?? undefined;
      } else {
        updatedWorkflow.nextRunAt = undefined;
      }

      await this.workflowRepo.update(updatedWorkflow);
    } finally {
      this.isExecuting = false;
    }
  }

  private async recoverStaleExecutions(): Promise<void> {
    try {
      const staleExecutions = await this.executionRepo.findByStatus(
        WorkflowExecutionStatus.Running
      );
      const now = this.clock.now();

      for (const execution of staleExecutions) {
        await this.executionRepo.update({
          ...execution,
          status: WorkflowExecutionStatus.Failed,
          completedAt: now,
          errorMessage: 'Daemon crashed during execution',
          updatedAt: now,
        });
      }
    } catch {
      // Best-effort recovery
    }
  }

  private async runRetentionCleanup(): Promise<void> {
    try {
      const cutoff = new Date(
        this.clock.now().getTime() - this.retentionDays * 24 * 60 * 60 * 1000
      );
      await this.executionRepo.deleteOlderThan(cutoff);
    } catch {
      // Best-effort cleanup
    }
  }

  private emitNotification(
    eventType: NotificationEventType,
    severity: NotificationSeverity,
    workflow: ScheduledWorkflow,
    execution: WorkflowExecution,
    message: string
  ): void {
    const event: NotificationEvent = {
      eventType,
      agentRunId: execution.id,
      featureId: workflow.id,
      featureName: workflow.name,
      message,
      severity,
      timestamp: this.clock.now().toISOString(),
    };
    this.notificationService.notify(event);
  }
}

// --- Singleton accessors (follows NotificationWatcherService pattern) ---

let schedulerInstance: WorkflowSchedulerService | null = null;

/**
 * Initialize the workflow scheduler singleton.
 * Must be called once during daemon startup.
 */
export function initializeWorkflowScheduler(
  workflowRepo: IWorkflowRepository,
  executionRepo: IWorkflowExecutionRepository,
  clock: IClock,
  notificationService: INotificationService,
  pollIntervalMs?: number,
  retentionDays?: number
): void {
  if (schedulerInstance !== null) {
    throw new Error('Workflow scheduler already initialized. Cannot re-initialize.');
  }

  schedulerInstance = new WorkflowSchedulerService(
    workflowRepo,
    executionRepo,
    clock,
    notificationService,
    pollIntervalMs,
    retentionDays
  );
}

/**
 * Get the workflow scheduler singleton.
 */
export function getWorkflowScheduler(): WorkflowSchedulerService {
  if (schedulerInstance === null) {
    throw new Error(
      'Workflow scheduler not initialized. Call initializeWorkflowScheduler() during daemon startup.'
    );
  }

  return schedulerInstance;
}

/**
 * Check if the workflow scheduler has been initialized.
 */
export function hasWorkflowScheduler(): boolean {
  return schedulerInstance !== null;
}

/**
 * Reset the workflow scheduler singleton (for testing purposes only).
 * Stops the scheduler if running before resetting.
 *
 * @internal
 */
export function resetWorkflowScheduler(): void {
  if (schedulerInstance !== null) {
    schedulerInstance.stop();
  }
  schedulerInstance = null;
}
