/**
 * Time-cursor delivery bookkeeping.
 *
 * Pollers that re-read rows with `created_at >= cursor` (inclusive — every
 * repository here implements `since` that way) must remember which rows AT
 * the cursor they already delivered, because the next read returns them
 * again. Rows older than the cursor can never come back from such a read, so
 * remembering them only grows memory for the life of the poller.
 *
 * Note the import convention for `domain/`: no imports, no I/O.
 */

/** Epoch millis of a `createdAt` that may arrive as Date, number or ISO string. */
export function createdAtMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

/**
 * Replace `delivered` with the ids of `rows` created exactly at `cursorMs` —
 * the only rows a `created_at >= cursorMs` read can return that were already
 * delivered. Call it after processing a batch read with that cursor; the
 * batch holds every delivered row at the cursor, so nothing needed is lost
 * and an evicted id cannot be re-emitted.
 */
export function retainDeliveredAtCursor<Row extends { id: string; createdAt: unknown }>(
  delivered: Set<string>,
  rows: readonly Row[],
  cursorMs: number
): void {
  const atCursor = rows.filter(
    (row) => delivered.has(row.id) && createdAtMillis(row.createdAt) === cursorMs
  );
  delivered.clear();
  for (const row of atCursor) delivered.add(row.id);
}
