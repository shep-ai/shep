/**
 * Workflow CLI Format Helpers
 *
 * Shared formatting utilities for workflow CLI commands.
 */

import type { ScheduledWorkflow, WorkflowExecution } from '@/domain/generated/output.js';
import { colors, symbols } from '../../ui/index.js';

/**
 * Format a workflow's current status indicator for list/show output.
 */
export function formatWorkflowStatus(workflow: ScheduledWorkflow): string {
  if (!workflow.enabled) {
    return `${colors.muted(symbols.dotEmpty)} ${colors.muted('disabled')}`;
  }
  if (workflow.cronExpression) {
    return `${colors.success(symbols.dot)} ${colors.success('scheduled')}`;
  }
  return `${colors.info(symbols.dot)} ${colors.info('on-demand')}`;
}

/**
 * Format an execution status with color and symbol.
 */
export function formatExecutionStatus(status: string): string {
  const map: Record<string, string> = {
    queued: `${colors.muted(symbols.dotEmpty)} ${colors.muted('queued')}`,
    running: `${colors.info(symbols.dot)} ${colors.info('running')}`,
    completed: `${colors.success(symbols.success)} ${colors.success('completed')}`,
    failed: `${colors.error(symbols.error)} ${colors.error('failed')}`,
    cancelled: `${colors.muted(symbols.dotEmpty)} ${colors.muted('cancelled')}`,
  };
  return map[status] ?? colors.muted(status);
}

/**
 * Format a Date as a locale string.
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString();
}

/**
 * Format a relative time string (e.g., "5 minutes ago").
 */
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Format execution duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format trigger type for display.
 */
export function formatTriggerType(triggerType: string): string {
  if (triggerType === 'manual') return colors.info('manual');
  if (triggerType === 'scheduled') return colors.accent('scheduled');
  return triggerType;
}

/**
 * Format execution row for history table.
 */
export function formatExecutionRow(execution: WorkflowExecution): string[] {
  return [
    execution.id.substring(0, 8),
    formatExecutionStatus(execution.status),
    formatTriggerType(execution.triggerType),
    execution.durationMs != null ? formatDuration(execution.durationMs) : colors.muted('-'),
    formatTimestamp(new Date(execution.startedAt)),
  ];
}
