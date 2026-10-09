/**
 * The UTC `YYYY-MM` of the calendar month before `now`.
 *
 * Monthly contributor recaps always cover the previous month so they never
 * run on a partial month.
 */
export function previousYearMonth(now: Date): string {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const yyyy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}
