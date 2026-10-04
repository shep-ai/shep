import { describe, it, expect } from 'vitest';
import { isIntervalDue } from '@/domain/shared/interval-schedule.js';

describe('isIntervalDue', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it('runs a rule that never ran, and skips a disabled one', () => {
    expect(isIntervalDue({ enabled: true, intervalMinutes: 15 }, now)).toBe(true);
    expect(isIntervalDue({ enabled: false, intervalMinutes: 15 }, now)).toBe(false);
  });

  it('waits for the interval since the last run', () => {
    const rule = { enabled: true, intervalMinutes: 15 };
    expect(isIntervalDue({ ...rule, lastRunAt: new Date('2026-10-01T11:50:00Z') }, now)).toBe(
      false
    );
    expect(isIntervalDue({ ...rule, lastRunAt: new Date('2026-10-01T11:45:00Z') }, now)).toBe(true);
  });
});
