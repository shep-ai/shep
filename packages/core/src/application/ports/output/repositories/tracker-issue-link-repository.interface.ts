/** Links between work items and tracker issues (spec 122). */

import type { TrackerIssueLink } from '../../../../domain/generated/output.js';

export interface ITrackerIssueLinkRepository {
  findByExternalId(connectionId: string, externalId: string): Promise<TrackerIssueLink | null>;
  findByWorkItemId(workItemId: string): Promise<TrackerIssueLink | null>;
  listByRule(ruleId: string): Promise<TrackerIssueLink[]>;
  /** Insert or replace the link of `link.workItemId`. */
  upsert(link: TrackerIssueLink): Promise<void>;
  deleteByRule(ruleId: string): Promise<void>;
  deleteByConnection(connectionId: string): Promise<void>;
}
