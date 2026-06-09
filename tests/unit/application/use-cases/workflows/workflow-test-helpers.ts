import { vi } from 'vitest';
import type { IWorkflowRepository } from '@shepai/core/application/ports/output/repositories/workflow-repository.interface.js';
import type { IWorkflowExecutionRepository } from '@shepai/core/application/ports/output/repositories/workflow-execution-repository.interface.js';
import type { IClock } from '@shepai/core/application/ports/output/services/clock.interface.js';
import type { ScheduledWorkflow, WorkflowExecution } from '@shepai/core/domain/generated/output.js';
import {
  WorkflowExecutionStatus,
  WorkflowTriggerType,
} from '@shepai/core/domain/generated/output.js';

export function createMockWorkflowRepo(): IWorkflowRepository {
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

export function createMockExecutionRepo(): IWorkflowExecutionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByWorkflowId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  };
}

export function createMockClock(date: Date = new Date('2026-01-15T10:00:00Z')): IClock {
  return { now: () => date };
}

export function createTestWorkflow(overrides?: Partial<ScheduledWorkflow>): ScheduledWorkflow {
  const now = new Date('2026-01-15T10:00:00Z');
  return {
    id: 'wf-1',
    name: 'test-workflow',
    prompt: 'Do something useful',
    enabled: true,
    repositoryPath: '/repo',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createTestExecution(overrides?: Partial<WorkflowExecution>): WorkflowExecution {
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
