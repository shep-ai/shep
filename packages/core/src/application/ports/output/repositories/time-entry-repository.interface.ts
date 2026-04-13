/**
 * Time Entry Repository Interface (Output Port)
 *
 * Defines the contract for TimeEntry entity persistence operations.
 * Tracks time logged against work items for project time management.
 */

import type { TimeEntry } from '../../../../domain/generated/output.js';

export interface ITimeEntryRepository {
  /** Create a new time entry record. */
  create(entry: TimeEntry): Promise<void>;

  /** Find a time entry by its unique ID. */
  findById(id: string): Promise<TimeEntry | null>;

  /** List all time entries for a work item. */
  listByWorkItem(workItemId: string): Promise<TimeEntry[]>;

  /** List all time entries for a project, optionally filtered by date range. */
  listByProject(projectId: string, startDate?: Date, endDate?: Date): Promise<TimeEntry[]>;

  /** Get the total logged minutes for a work item. */
  getTotalMinutes(workItemId: string): Promise<number>;

  /** Permanently delete a time entry. */
  delete(id: string): Promise<void>;
}
