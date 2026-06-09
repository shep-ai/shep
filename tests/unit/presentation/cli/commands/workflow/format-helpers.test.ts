/**
 * Workflow Format Helpers Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => `[muted:${s}]`,
    accent: (s: string) => `[accent:${s}]`,
    success: (s: string) => `[success:${s}]`,
    info: (s: string) => `[info:${s}]`,
    error: (s: string) => `[error:${s}]`,
  },
  symbols: {
    success: '✓',
    error: '✗',
    dot: '●',
    dotEmpty: '○',
  },
}));

import {
  formatWorkflowStatus,
  formatExecutionStatus,
  formatDuration,
  formatTriggerType,
} from '../../../../../../src/presentation/cli/commands/workflow/format-helpers.js';

describe('formatWorkflowStatus', () => {
  it('returns disabled for disabled workflow', () => {
    const result = formatWorkflowStatus({ enabled: false } as never);
    expect(result).toContain('disabled');
    expect(result).toContain('[muted:');
  });

  it('returns scheduled for enabled workflow with cron', () => {
    const result = formatWorkflowStatus({
      enabled: true,
      cronExpression: '0 9 * * MON',
    } as never);
    expect(result).toContain('scheduled');
    expect(result).toContain('[success:');
  });

  it('returns on-demand for enabled workflow without cron', () => {
    const result = formatWorkflowStatus({ enabled: true } as never);
    expect(result).toContain('on-demand');
    expect(result).toContain('[info:');
  });
});

describe('formatExecutionStatus', () => {
  it('formats queued status', () => {
    expect(formatExecutionStatus('queued')).toContain('queued');
    expect(formatExecutionStatus('queued')).toContain('[muted:');
  });

  it('formats running status', () => {
    expect(formatExecutionStatus('running')).toContain('running');
    expect(formatExecutionStatus('running')).toContain('[info:');
  });

  it('formats completed status', () => {
    expect(formatExecutionStatus('completed')).toContain('completed');
    expect(formatExecutionStatus('completed')).toContain('[success:');
  });

  it('formats failed status', () => {
    expect(formatExecutionStatus('failed')).toContain('failed');
    expect(formatExecutionStatus('failed')).toContain('[error:');
  });

  it('formats cancelled status', () => {
    expect(formatExecutionStatus('cancelled')).toContain('cancelled');
    expect(formatExecutionStatus('cancelled')).toContain('[muted:');
  });

  it('handles unknown status', () => {
    expect(formatExecutionStatus('unknown')).toContain('unknown');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3780000)).toBe('1h 3m');
  });
});

describe('formatTriggerType', () => {
  it('formats manual trigger', () => {
    expect(formatTriggerType('manual')).toContain('manual');
    expect(formatTriggerType('manual')).toContain('[info:');
  });

  it('formats scheduled trigger', () => {
    expect(formatTriggerType('scheduled')).toContain('scheduled');
    expect(formatTriggerType('scheduled')).toContain('[accent:');
  });
});
