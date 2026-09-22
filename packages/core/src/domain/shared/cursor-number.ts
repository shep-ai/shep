/**
 * Cursor Number Normalization
 *
 * Shared guard for the numeric values a paging cursor carries. Both
 * `list-findings` and `rank-findings` clamp a requested limit/offset into
 * range before handing it to the repository, and both are reachable straight
 * from a CLI flag: `shep aspm findings --limit abc`.
 */

/**
 * Return `value` when it is a usable number, otherwise `fallback`.
 *
 * `Math.max` and `Math.min` propagate `NaN` rather than rejecting it, so the
 * usual clamp is a no-op for it: `Math.min(200, Math.max(1, NaN))` is `NaN`.
 * That `NaN` is then bound straight into `LIMIT ? OFFSET ?`, where SQLite
 * rejects it instead of reading a page of rows — a typo in a flag turns into a
 * crash rather than a default page.
 *
 * `Number.isFinite` covers both `NaN` and `±Infinity`, so an overflowing value
 * (`--limit 1e999`) is treated as "not requested" too.
 */
export function finiteOrFallback(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
