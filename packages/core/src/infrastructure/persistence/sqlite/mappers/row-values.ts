/**
 * Column value helpers shared by the SQLite mappers: timestamps are stored as
 * epoch milliseconds and absent optional fields as NULL.
 */

/** Epoch milliseconds for a timestamp column. */
export function millis(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Epoch milliseconds, or NULL for an unset timestamp. */
export function optionalMillis(value: Date | string | number | undefined): number | null {
  return value === undefined ? null : millis(value);
}

/** The timestamp of an epoch-milliseconds column, or null when it is NULL. */
export function optionalDate(value: number | null): Date | null {
  return value === null ? null : new Date(value);
}

/** Only the non-null entries of `fields`, so optional properties stay absent. */
export { defined } from '../../../../domain/shared/defined.js';
