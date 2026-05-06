/**
 * RecognitionEvent Repository Interface (Output Port) — spec 097, FR-22 / NFR-11.
 *
 * Persistence contract for the RecognitionEvent entity. The `insert` method
 * is the canonical idempotent upsert: it returns whether a row was actually
 * inserted (true) or skipped because of the UNIQUE(contributor_id, kind,
 * pr_number) constraint (false). The use case `award-recognition` short-
 * circuits the `IAllContributorsWriter` call when this returns false.
 */

import type { RecognitionEvent } from '../../../../domain/generated/output.js';

/**
 * Result of an idempotent insert.
 *
 * `inserted = true` means a new row was written.
 * `inserted = false` means an existing row already covered the
 * (contributor_id, kind, pr_number) triple and the call was a no-op.
 */
export interface RecognitionInsertResult {
  inserted: boolean;
}

export interface IRecognitionEventRepository {
  /**
   * Idempotent insert. If a row with the same (contributor_id, kind,
   * pr_number) already exists, returns `{ inserted: false }` without
   * mutating state.
   */
  insert(event: RecognitionEvent): Promise<RecognitionInsertResult>;

  /** All recognition events for a contributor, ordered by occurred_at DESC. */
  findByContributorId(contributorId: string): Promise<RecognitionEvent[]>;

  /**
   * All recognition events whose `occurredAt` falls within the given UTC
   * year-month bucket (e.g. '2026-04'). Used by the monthly recap.
   */
  findByMonth(yearMonth: string): Promise<RecognitionEvent[]>;
}
