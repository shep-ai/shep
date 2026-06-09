/**
 * Workflow Execution Mapper Tests
 *
 * Tests for bidirectional mapping between WorkflowExecution domain objects
 * and SQLite database rows.
 */

import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type WorkflowExecutionRow,
} from '@/infrastructure/persistence/sqlite/mappers/workflow-execution.mapper.js';
import {
  WorkflowTriggerType,
  WorkflowExecutionStatus,
  type WorkflowExecution,
} from '@/domain/generated/output.js';

function createTestExecution(overrides: Partial<WorkflowExecution> = {}): WorkflowExecution {
  return {
    id: 'exec-abc-123',
    workflowId: 'wf-abc-123',
    triggerType: WorkflowTriggerType.Manual,
    status: WorkflowExecutionStatus.Completed,
    startedAt: new Date('2026-03-10T09:00:00Z'),
    completedAt: new Date('2026-03-10T09:05:00Z'),
    durationMs: 300000,
    outputSummary: 'Closed 3 issues',
    errorMessage: undefined,
    createdAt: new Date('2026-03-10T09:00:00Z'),
    updatedAt: new Date('2026-03-10T09:05:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<WorkflowExecutionRow> = {}): WorkflowExecutionRow {
  return {
    id: 'exec-abc-123',
    workflow_id: 'wf-abc-123',
    trigger_type: 'manual',
    status: 'completed',
    started_at: new Date('2026-03-10T09:00:00Z').getTime(),
    completed_at: new Date('2026-03-10T09:05:00Z').getTime(),
    duration_ms: 300000,
    output_summary: 'Closed 3 issues',
    error_message: null,
    created_at: new Date('2026-03-10T09:00:00Z').getTime(),
    updated_at: new Date('2026-03-10T09:05:00Z').getTime(),
    ...overrides,
  };
}

describe('Workflow Execution Mapper', () => {
  describe('toDatabase()', () => {
    it('maps a completed execution to a database row', () => {
      const execution = createTestExecution();
      const row = toDatabase(execution);

      expect(row.id).toBe('exec-abc-123');
      expect(row.workflow_id).toBe('wf-abc-123');
      expect(row.trigger_type).toBe('manual');
      expect(row.status).toBe('completed');
      expect(row.output_summary).toBe('Closed 3 issues');
    });

    it('converts Date fields to unix milliseconds', () => {
      const execution = createTestExecution();
      const row = toDatabase(execution);

      expect(row.started_at).toBe(new Date('2026-03-10T09:00:00Z').getTime());
      expect(row.completed_at).toBe(new Date('2026-03-10T09:05:00Z').getTime());
      expect(row.created_at).toBe(new Date('2026-03-10T09:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2026-03-10T09:05:00Z').getTime());
    });

    it('maps undefined optional fields to null', () => {
      const execution = createTestExecution({
        completedAt: undefined,
        durationMs: undefined,
        outputSummary: undefined,
        errorMessage: undefined,
      });
      const row = toDatabase(execution);

      expect(row.completed_at).toBeNull();
      expect(row.duration_ms).toBeNull();
      expect(row.output_summary).toBeNull();
      expect(row.error_message).toBeNull();
    });

    it('preserves enum values as strings', () => {
      const execution = createTestExecution({
        triggerType: WorkflowTriggerType.Scheduled,
        status: WorkflowExecutionStatus.Failed,
      });
      const row = toDatabase(execution);

      expect(row.trigger_type).toBe('scheduled');
      expect(row.status).toBe('failed');
    });

    it('maps a failed execution with error message', () => {
      const execution = createTestExecution({
        status: WorkflowExecutionStatus.Failed,
        errorMessage: 'GitHub API rate limit exceeded',
        outputSummary: undefined,
      });
      const row = toDatabase(execution);

      expect(row.status).toBe('failed');
      expect(row.error_message).toBe('GitHub API rate limit exceeded');
      expect(row.output_summary).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps a database row to a WorkflowExecution', () => {
      const row = createTestRow();
      const execution = fromDatabase(row);

      expect(execution.id).toBe('exec-abc-123');
      expect(execution.workflowId).toBe('wf-abc-123');
      expect(execution.triggerType).toBe(WorkflowTriggerType.Manual);
      expect(execution.status).toBe(WorkflowExecutionStatus.Completed);
      expect(execution.outputSummary).toBe('Closed 3 issues');
    });

    it('converts unix milliseconds to Date objects', () => {
      const row = createTestRow();
      const execution = fromDatabase(row);

      expect(execution.startedAt).toBeInstanceOf(Date);
      expect(execution.completedAt).toBeInstanceOf(Date);
      expect(execution.createdAt).toBeInstanceOf(Date);
      expect(execution.updatedAt).toBeInstanceOf(Date);
      expect((execution.startedAt as Date).toISOString()).toBe('2026-03-10T09:00:00.000Z');
    });

    it('omits optional fields when null in database', () => {
      const row = createTestRow({
        completed_at: null,
        duration_ms: null,
        output_summary: null,
        error_message: null,
      });
      const execution = fromDatabase(row);

      expect(execution.completedAt).toBeUndefined();
      expect(execution.durationMs).toBeUndefined();
      expect(execution.outputSummary).toBeUndefined();
      expect(execution.errorMessage).toBeUndefined();
    });

    it('maps enum string values to enum types', () => {
      const row = createTestRow({
        trigger_type: 'scheduled',
        status: 'running',
      });
      const execution = fromDatabase(row);

      expect(execution.triggerType).toBe(WorkflowTriggerType.Scheduled);
      expect(execution.status).toBe(WorkflowExecutionStatus.Running);
    });
  });

  describe('round-trip', () => {
    it('preserves data through toDatabase(fromDatabase(row))', () => {
      const originalRow = createTestRow();
      const execution = fromDatabase(originalRow);
      const roundTrippedRow = toDatabase(execution);

      expect(roundTrippedRow.id).toBe(originalRow.id);
      expect(roundTrippedRow.workflow_id).toBe(originalRow.workflow_id);
      expect(roundTrippedRow.trigger_type).toBe(originalRow.trigger_type);
      expect(roundTrippedRow.status).toBe(originalRow.status);
      expect(roundTrippedRow.started_at).toBe(originalRow.started_at);
      expect(roundTrippedRow.completed_at).toBe(originalRow.completed_at);
      expect(roundTrippedRow.duration_ms).toBe(originalRow.duration_ms);
      expect(roundTrippedRow.output_summary).toBe(originalRow.output_summary);
      expect(roundTrippedRow.error_message).toBe(originalRow.error_message);
      expect(roundTrippedRow.created_at).toBe(originalRow.created_at);
      expect(roundTrippedRow.updated_at).toBe(originalRow.updated_at);
    });

    it('preserves data through fromDatabase(toDatabase(execution))', () => {
      const original = createTestExecution();
      const row = toDatabase(original);
      const roundTripped = fromDatabase(row);

      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.workflowId).toBe(original.workflowId);
      expect(roundTripped.triggerType).toBe(original.triggerType);
      expect(roundTripped.status).toBe(original.status);
      expect(roundTripped.durationMs).toBe(original.durationMs);
      expect(roundTripped.outputSummary).toBe(original.outputSummary);
    });
  });
});
