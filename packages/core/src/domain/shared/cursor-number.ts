/**
 * Cursor Number Normalization
 *
 * Shared guard for the numeric values a paging cursor carries. Every caller
 * binds the value into SQLite's `LIMIT ?` / `OFFSET ?`, and every caller is
 * reachable straight from a CLI flag or a URL query parameter:
 * `shep aspm findings --limit abc`, `shep agent questions ls --limit 2.5`.
 */

/**
 * Return `value` when it is a usable page size / offset, otherwise `fallback`.
 *
 * SQLite accepts only an integer in `LIMIT ?` / `OFFSET ?`; `NaN`, `±Infinity`
 * and a fractional value such as `2.5` all raise `datatype mismatch`. None of
 * them is caught by the usual guards: `?? DEFAULT` lets `NaN` through because
 * it is not nullish, and `Math.max` / `Math.min` propagate `NaN` and keep a
 * fraction — `Math.min(200, Math.max(1, NaN))` is `NaN`, and
 * `Math.max(1, 2.5)` is `2.5`. A typo in a flag would turn into a crash rather
 * than a default page.
 *
 * `Number.isInteger` rejects all three at once. Pass `undefined` as the
 * fallback to leave the repository to apply its own default.
 */
export function integerOrFallback<F extends number | undefined>(
  value: number | undefined,
  fallback: F
): number | F {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}
