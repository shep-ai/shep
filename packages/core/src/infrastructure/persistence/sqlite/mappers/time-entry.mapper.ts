/**
 * TimeEntry Database Mapper
 *
 * Maps between TimeEntry domain objects and SQLite database rows.
 */

import type { TimeEntry } from '../../../../domain/generated/output.js';

export interface TimeEntryRow {
  id: string;
  work_item_id: string;
  duration_minutes: number;
  note: string | null;
  logged_at: number;
  created_at: number;
  updated_at: number;
}

export function toDatabase(entry: TimeEntry): TimeEntryRow {
  return {
    id: entry.id,
    work_item_id: entry.workItemId,
    duration_minutes: entry.durationMinutes,
    note: entry.note ?? null,
    logged_at: entry.loggedAt instanceof Date ? entry.loggedAt.getTime() : entry.loggedAt,
    created_at: entry.createdAt instanceof Date ? entry.createdAt.getTime() : entry.createdAt,
    updated_at: entry.updatedAt instanceof Date ? entry.updatedAt.getTime() : entry.updatedAt,
  };
}

export function fromDatabase(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    durationMinutes: row.duration_minutes,
    note: row.note ?? undefined,
    loggedAt: new Date(row.logged_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
