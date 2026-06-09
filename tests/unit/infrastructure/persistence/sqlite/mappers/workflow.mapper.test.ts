/**
 * Scheduled Workflow Mapper Tests
 *
 * Tests for bidirectional mapping between ScheduledWorkflow domain objects
 * and SQLite database rows.
 */

import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type ScheduledWorkflowRow,
} from '@/infrastructure/persistence/sqlite/mappers/workflow.mapper.js';
import type { ScheduledWorkflow } from '@/domain/generated/output.js';

function createTestWorkflow(overrides: Partial<ScheduledWorkflow> = {}): ScheduledWorkflow {
  return {
    id: 'wf-abc-123',
    name: 'issue-triage',
    description: 'Triage open GitHub issues',
    prompt: 'Scan all open issues and close resolved ones',
    toolConstraints: ['git', 'github'],
    cronExpression: '0 9 * * MON',
    timezone: 'America/New_York',
    enabled: true,
    lastRunAt: new Date('2026-03-10T09:00:00Z'),
    nextRunAt: new Date('2026-03-17T09:00:00Z'),
    repositoryPath: '/home/dev/repo',
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-10T09:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<ScheduledWorkflowRow> = {}): ScheduledWorkflowRow {
  return {
    id: 'wf-abc-123',
    name: 'issue-triage',
    description: 'Triage open GitHub issues',
    prompt: 'Scan all open issues and close resolved ones',
    tool_constraints: JSON.stringify(['git', 'github']),
    cron_expression: '0 9 * * MON',
    timezone: 'America/New_York',
    enabled: 1,
    last_run_at: new Date('2026-03-10T09:00:00Z').getTime(),
    next_run_at: new Date('2026-03-17T09:00:00Z').getTime(),
    repository_path: '/home/dev/repo',
    deleted_at: null,
    created_at: new Date('2026-03-01T00:00:00Z').getTime(),
    updated_at: new Date('2026-03-10T09:00:00Z').getTime(),
    ...overrides,
  };
}

describe('Workflow Mapper', () => {
  describe('toDatabase()', () => {
    it('maps a full ScheduledWorkflow to a database row', () => {
      const workflow = createTestWorkflow();
      const row = toDatabase(workflow);

      expect(row.id).toBe('wf-abc-123');
      expect(row.name).toBe('issue-triage');
      expect(row.description).toBe('Triage open GitHub issues');
      expect(row.prompt).toBe('Scan all open issues and close resolved ones');
      expect(row.repository_path).toBe('/home/dev/repo');
    });

    it('converts toolConstraints to JSON string', () => {
      const workflow = createTestWorkflow();
      const row = toDatabase(workflow);
      expect(row.tool_constraints).toBe(JSON.stringify(['git', 'github']));
    });

    it('converts enabled true to 1', () => {
      const workflow = createTestWorkflow({ enabled: true });
      const row = toDatabase(workflow);
      expect(row.enabled).toBe(1);
    });

    it('converts enabled false to 0', () => {
      const workflow = createTestWorkflow({ enabled: false });
      const row = toDatabase(workflow);
      expect(row.enabled).toBe(0);
    });

    it('converts Date fields to unix milliseconds', () => {
      const workflow = createTestWorkflow();
      const row = toDatabase(workflow);
      expect(row.created_at).toBe(new Date('2026-03-01T00:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2026-03-10T09:00:00Z').getTime());
      expect(row.last_run_at).toBe(new Date('2026-03-10T09:00:00Z').getTime());
      expect(row.next_run_at).toBe(new Date('2026-03-17T09:00:00Z').getTime());
    });

    it('maps undefined optional fields to null', () => {
      const workflow = createTestWorkflow({
        description: undefined,
        toolConstraints: undefined,
        cronExpression: undefined,
        timezone: undefined,
        lastRunAt: undefined,
        nextRunAt: undefined,
      });
      const row = toDatabase(workflow);
      expect(row.description).toBeNull();
      expect(row.tool_constraints).toBeNull();
      expect(row.cron_expression).toBeNull();
      expect(row.timezone).toBeNull();
      expect(row.last_run_at).toBeNull();
      expect(row.next_run_at).toBeNull();
    });

    it('maps deletedAt Date to unix milliseconds', () => {
      const deletedAt = new Date('2026-03-15T12:00:00Z');
      const workflow = createTestWorkflow({ deletedAt });
      const row = toDatabase(workflow);
      expect(row.deleted_at).toBe(deletedAt.getTime());
    });

    it('maps undefined deletedAt to null', () => {
      const workflow = createTestWorkflow();
      const row = toDatabase(workflow);
      expect(row.deleted_at).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('maps a full database row to a ScheduledWorkflow', () => {
      const row = createTestRow();
      const workflow = fromDatabase(row);

      expect(workflow.id).toBe('wf-abc-123');
      expect(workflow.name).toBe('issue-triage');
      expect(workflow.description).toBe('Triage open GitHub issues');
      expect(workflow.prompt).toBe('Scan all open issues and close resolved ones');
      expect(workflow.repositoryPath).toBe('/home/dev/repo');
    });

    it('parses tool_constraints JSON string to string array', () => {
      const row = createTestRow();
      const workflow = fromDatabase(row);
      expect(workflow.toolConstraints).toEqual(['git', 'github']);
    });

    it('converts enabled 1 to true', () => {
      const row = createTestRow({ enabled: 1 });
      const workflow = fromDatabase(row);
      expect(workflow.enabled).toBe(true);
    });

    it('converts enabled 0 to false', () => {
      const row = createTestRow({ enabled: 0 });
      const workflow = fromDatabase(row);
      expect(workflow.enabled).toBe(false);
    });

    it('converts unix milliseconds to Date objects', () => {
      const row = createTestRow();
      const workflow = fromDatabase(row);
      expect(workflow.createdAt).toBeInstanceOf(Date);
      expect(workflow.updatedAt).toBeInstanceOf(Date);
      expect(workflow.lastRunAt).toBeInstanceOf(Date);
      expect(workflow.nextRunAt).toBeInstanceOf(Date);
      expect((workflow.createdAt as Date).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('omits optional fields when null in database', () => {
      const row = createTestRow({
        description: null,
        tool_constraints: null,
        cron_expression: null,
        timezone: null,
        last_run_at: null,
        next_run_at: null,
        deleted_at: null,
      });
      const workflow = fromDatabase(row);
      expect(workflow.description).toBeUndefined();
      expect(workflow.toolConstraints).toBeUndefined();
      expect(workflow.cronExpression).toBeUndefined();
      expect(workflow.timezone).toBeUndefined();
      expect(workflow.lastRunAt).toBeUndefined();
      expect(workflow.nextRunAt).toBeUndefined();
      expect(workflow.deletedAt).toBeUndefined();
    });

    it('maps non-null deleted_at to Date', () => {
      const ts = new Date('2026-03-15T12:00:00Z').getTime();
      const row = createTestRow({ deleted_at: ts });
      const workflow = fromDatabase(row);
      expect(workflow.deletedAt).toEqual(new Date(ts));
    });
  });

  describe('round-trip', () => {
    it('preserves data through toDatabase(fromDatabase(row))', () => {
      const originalRow = createTestRow();
      const workflow = fromDatabase(originalRow);
      const roundTrippedRow = toDatabase(workflow);

      expect(roundTrippedRow.id).toBe(originalRow.id);
      expect(roundTrippedRow.name).toBe(originalRow.name);
      expect(roundTrippedRow.description).toBe(originalRow.description);
      expect(roundTrippedRow.prompt).toBe(originalRow.prompt);
      expect(roundTrippedRow.tool_constraints).toBe(originalRow.tool_constraints);
      expect(roundTrippedRow.cron_expression).toBe(originalRow.cron_expression);
      expect(roundTrippedRow.timezone).toBe(originalRow.timezone);
      expect(roundTrippedRow.enabled).toBe(originalRow.enabled);
      expect(roundTrippedRow.last_run_at).toBe(originalRow.last_run_at);
      expect(roundTrippedRow.next_run_at).toBe(originalRow.next_run_at);
      expect(roundTrippedRow.repository_path).toBe(originalRow.repository_path);
      expect(roundTrippedRow.deleted_at).toBe(originalRow.deleted_at);
      expect(roundTrippedRow.created_at).toBe(originalRow.created_at);
      expect(roundTrippedRow.updated_at).toBe(originalRow.updated_at);
    });

    it('preserves data through fromDatabase(toDatabase(workflow))', () => {
      const originalWorkflow = createTestWorkflow();
      const row = toDatabase(originalWorkflow);
      const roundTripped = fromDatabase(row);

      expect(roundTripped.id).toBe(originalWorkflow.id);
      expect(roundTripped.name).toBe(originalWorkflow.name);
      expect(roundTripped.description).toBe(originalWorkflow.description);
      expect(roundTripped.prompt).toBe(originalWorkflow.prompt);
      expect(roundTripped.toolConstraints).toEqual(originalWorkflow.toolConstraints);
      expect(roundTripped.cronExpression).toBe(originalWorkflow.cronExpression);
      expect(roundTripped.timezone).toBe(originalWorkflow.timezone);
      expect(roundTripped.enabled).toBe(originalWorkflow.enabled);
      expect(roundTripped.repositoryPath).toBe(originalWorkflow.repositoryPath);
    });
  });
});
