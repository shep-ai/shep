/**
 * Cron Expression Helpers
 *
 * Shared utilities for cron expression validation and next-run calculation
 * used by CreateScheduledWorkflowUseCase, UpdateScheduledWorkflowUseCase,
 * and ScheduleScheduledWorkflowUseCase.
 *
 * Uses croner for both validation and next-run calculation to ensure consistency
 * between what the UI accepts and what the scheduler evaluates at runtime.
 */

import { Cron } from 'croner';

/**
 * Validate a cron expression using croner.
 * Throws a descriptive error if the expression is invalid.
 *
 * @param cronExpression - The cron expression to validate
 * @throws Error with a descriptive message if the expression is invalid
 */
export function validateCronExpression(cronExpression: string): void {
  try {
    new Cron(cronExpression, { paused: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid cron expression "${cronExpression}": ${message}. ` +
        `Example: "0 9 * * MON" runs every Monday at 9am.`
    );
  }
}

/**
 * Calculate the next run time for a cron expression from a reference date.
 *
 * @param cronExpression - A valid cron expression
 * @param timezone - Optional IANA timezone (defaults to UTC)
 * @param referenceDate - The reference date to calculate from (defaults to now)
 * @returns The next run Date, or null if no future run exists
 */
export function calculateNextRunAt(
  cronExpression: string,
  timezone?: string,
  referenceDate?: Date
): Date | null {
  const cron = new Cron(cronExpression, {
    paused: true,
    ...(timezone ? { timezone } : {}),
  });
  const next = cron.nextRun(referenceDate);
  return next ?? null;
}
