/**
 * RecognitionEvent Database Mapper (spec 097).
 *
 * Maps between RecognitionEvent domain objects and SQLite rows for the
 * `recognition_events` table (migration 102).
 */

import type { RecognitionEvent, RecognitionKind } from '../../../../domain/generated/output.js';

export interface RecognitionEventRow {
  id: string;
  contributor_id: string;
  kind: string;
  occurred_at: number;
  pr_number: number;
  month_recap_id: string | null;
  created_at: number;
  updated_at: number;
}

function toMillis(value: RecognitionEvent['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

export function toDatabase(event: RecognitionEvent): RecognitionEventRow {
  return {
    id: event.id,
    contributor_id: event.contributorId,
    kind: event.kind as string,
    occurred_at: toMillis(event.occurredAt),
    pr_number: event.prNumber,
    month_recap_id: event.monthRecapId ?? null,
    created_at: toMillis(event.createdAt),
    updated_at: toMillis(event.updatedAt),
  };
}

export function fromDatabase(row: RecognitionEventRow): RecognitionEvent {
  return {
    id: row.id,
    contributorId: row.contributor_id,
    kind: row.kind as RecognitionKind,
    occurredAt: new Date(row.occurred_at),
    prNumber: row.pr_number,
    monthRecapId: row.month_recap_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
