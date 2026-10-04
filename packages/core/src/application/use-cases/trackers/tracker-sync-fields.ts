/**
 * The values one tracker sync compares and writes (spec 122): an issue's
 * fields, a work item's fields, the snapshot a link keeps of the last sync,
 * and the work item update a sync plan turns into.
 */

import type {
  ExternalIssue,
  Connection,
  TrackerIssueLink,
  TrackerSyncRule,
  TrackerSyncRunSummary,
  WorkItem,
} from '../../../domain/generated/output.js';
import type { ProjectStates } from '../../../domain/shared/project-states.js';
import type { SyncedFields } from '../../../domain/shared/tracker-sync.js';
import type { UpdateWorkItemInput } from '../work-items/update-work-item.use-case.js';

export function emptySummary(): TrackerSyncRunSummary {
  return { created: 0, updated: 0, pushed: 0, conflicts: 0, failed: 0, rateLimited: false };
}

export function remoteFields(issue: ExternalIssue): SyncedFields {
  return {
    title: issue.title,
    ...(issue.description ? { description: issue.description } : {}),
    stateGroup: issue.stateGroup,
    priority: issue.priority,
  };
}

export function localFields(workItem: WorkItem, states: ProjectStates): SyncedFields {
  return {
    title: workItem.title,
    ...(workItem.description ? { description: workItem.description } : {}),
    stateGroup: states.groupFor(workItem.stateId),
    priority: workItem.priority,
  };
}

export function snapshotFields(link: TrackerIssueLink): SyncedFields {
  return {
    title: link.syncedTitle,
    ...(link.syncedDescription ? { description: link.syncedDescription } : {}),
    stateGroup: link.syncedStateGroup,
    priority: link.syncedPriority,
  };
}

type SnapshotColumns = Pick<
  TrackerIssueLink,
  'syncedTitle' | 'syncedDescription' | 'syncedStateGroup' | 'syncedPriority'
>;

function snapshotColumns(fields: SyncedFields): SnapshotColumns {
  return {
    syncedTitle: fields.title,
    ...(fields.description ? { syncedDescription: fields.description } : {}),
    syncedStateGroup: fields.stateGroup,
    syncedPriority: fields.priority,
  };
}

/** The link after a sync, remembering the values both sides now share. */
export function withSnapshot(
  link: TrackerIssueLink,
  fields: SyncedFields,
  remoteUpdatedAt: Date
): TrackerIssueLink {
  const { syncedDescription: _previous, ...rest } = link;
  return { ...rest, ...snapshotColumns(fields), remoteUpdatedAt, updatedAt: new Date() };
}

/** The link for a newly imported issue. */
export function newLink(
  rule: TrackerSyncRule,
  connection: Connection,
  issue: ExternalIssue,
  workItemId: string
): TrackerIssueLink {
  const now = new Date();
  return {
    workItemId,
    ruleId: rule.id,
    connectionId: connection.id,
    externalId: issue.externalId,
    externalKey: issue.key,
    externalUrl: issue.url,
    ...snapshotColumns(remoteFields(issue)),
    remoteUpdatedAt: issue.updatedAt,
    createdAt: now,
    updatedAt: now,
  };
}

/** The work item update for the remote values a sync plan applies. */
export function workItemUpdate(
  applyLocal: Partial<SyncedFields>,
  states: ProjectStates
): UpdateWorkItemInput {
  return {
    ...(applyLocal.title !== undefined ? { title: applyLocal.title } : {}),
    ...('description' in applyLocal ? { description: applyLocal.description ?? '' } : {}),
    ...(applyLocal.stateGroup !== undefined
      ? { stateId: states.stateFor(applyLocal.stateGroup) }
      : {}),
    ...(applyLocal.priority !== undefined ? { priority: applyLocal.priority } : {}),
  };
}
