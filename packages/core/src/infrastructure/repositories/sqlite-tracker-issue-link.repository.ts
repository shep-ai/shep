/** SQLite repository for work item ↔ tracker issue links (spec 122). */

import type Database from 'better-sqlite3';
import type { TrackerIssueLink } from '../../domain/generated/output.js';
import type { ITrackerIssueLinkRepository } from '../../application/ports/output/repositories/tracker-issue-link-repository.interface.js';
import {
  trackerIssueLinkFromDatabase,
  trackerIssueLinkToDatabase,
  type TrackerIssueLinkRow,
} from '../persistence/sqlite/mappers/tracker-sync.mapper.js';

export class SQLiteTrackerIssueLinkRepository implements ITrackerIssueLinkRepository {
  constructor(private readonly db: Database.Database) {}

  async findByExternalId(
    connectionId: string,
    externalId: string
  ): Promise<TrackerIssueLink | null> {
    const row = this.db
      .prepare('SELECT * FROM tracker_issue_links WHERE connection_id = ? AND external_id = ?')
      .get(connectionId, externalId) as TrackerIssueLinkRow | undefined;
    return row ? trackerIssueLinkFromDatabase(row) : null;
  }

  async findByWorkItemId(workItemId: string): Promise<TrackerIssueLink | null> {
    const row = this.db
      .prepare('SELECT * FROM tracker_issue_links WHERE work_item_id = ?')
      .get(workItemId) as TrackerIssueLinkRow | undefined;
    return row ? trackerIssueLinkFromDatabase(row) : null;
  }

  async listByRule(ruleId: string): Promise<TrackerIssueLink[]> {
    const rows = this.db
      .prepare('SELECT * FROM tracker_issue_links WHERE rule_id = ? ORDER BY created_at ASC')
      .all(ruleId) as TrackerIssueLinkRow[];
    return rows.map(trackerIssueLinkFromDatabase);
  }

  async upsert(link: TrackerIssueLink): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tracker_issue_links (work_item_id, rule_id, connection_id, external_id,
           external_key, external_url, synced_title, synced_description, synced_state_group,
           synced_priority, remote_updated_at, created_at, updated_at)
         VALUES (@work_item_id, @rule_id, @connection_id, @external_id, @external_key,
           @external_url, @synced_title, @synced_description, @synced_state_group,
           @synced_priority, @remote_updated_at, @created_at, @updated_at)
         ON CONFLICT(work_item_id) DO UPDATE SET
           rule_id = excluded.rule_id, connection_id = excluded.connection_id,
           external_id = excluded.external_id, external_key = excluded.external_key,
           external_url = excluded.external_url, synced_title = excluded.synced_title,
           synced_description = excluded.synced_description,
           synced_state_group = excluded.synced_state_group,
           synced_priority = excluded.synced_priority,
           remote_updated_at = excluded.remote_updated_at, updated_at = excluded.updated_at`
      )
      .run(trackerIssueLinkToDatabase(link));
  }

  async deleteByRule(ruleId: string): Promise<void> {
    this.db.prepare('DELETE FROM tracker_issue_links WHERE rule_id = ?').run(ruleId);
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    this.db.prepare('DELETE FROM tracker_issue_links WHERE connection_id = ?').run(connectionId);
  }
}
