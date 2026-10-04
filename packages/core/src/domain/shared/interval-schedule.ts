/**
 * Interval scheduling for sync rules and sources (spec 122, shared in spec
 * 125): whether something that runs every N minutes is due.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

const MS_PER_MINUTE = 60_000;

export interface IntervalSchedule {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: Date | string;
}

/** Whether an enabled schedule's interval has passed since its last run (or it never ran). */
export function isIntervalDue(schedule: IntervalSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.lastRunAt) return true;
  return (
    now.getTime() - new Date(schedule.lastRunAt).getTime() >=
    schedule.intervalMinutes * MS_PER_MINUTE
  );
}
