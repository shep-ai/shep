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

/** Only the non-null entries of `fields`, so optional properties stay absent. */
export function defined<T extends Record<string, unknown>>(
  fields: T
): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)
  ) as { [K in keyof T]?: NonNullable<T[K]> };
}
