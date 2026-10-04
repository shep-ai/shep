/** Tracker sync rule repository (spec 122). */

import type { TrackerSyncRule } from '../../../../domain/generated/output.js';

export interface ITrackerSyncRuleRepository {
  /** Every rule, or the rules of one connection. */
  list(connectionId?: string): Promise<TrackerSyncRule[]>;
  findById(id: string): Promise<TrackerSyncRule | null>;
  create(rule: TrackerSyncRule): Promise<void>;
  update(rule: TrackerSyncRule): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByConnection(connectionId: string): Promise<void>;
}
