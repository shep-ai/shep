/**
 * Tracker sync mappers (spec 122): rows <-> entities for connections, sync
 * rules and issue links. Dates are INTEGER unix milliseconds; optional fields
 * are nullable columns. Connection secrets are handled by the repository and
 * never pass through these mappers.
 */

import type {
  Priority,
  StateGroup,
  TrackerConnection,
  TrackerConnectionStatus,
  TrackerIssueLink,
  TrackerProvider,
  TrackerSyncDirection,
  TrackerSyncRule,
  TrackerSyncRunSummary,
} from '../../../../domain/generated/output.js';

export interface TrackerConnectionRow {
  id: string;
  provider: string;
  name: string;
  slug: string;
  space_id: string;
  site_url: string | null;
  account_email: string | null;
  account_name: string | null;
  status: string;
  last_error: string | null;
  last_checked_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TrackerSyncRuleRow {
  id: string;
  connection_id: string;
  project_id: string;
  scope: string;
  direction: string;
  interval_minutes: number;
  enabled: number;
  cursor: number | null;
  last_run_at: number | null;
  last_run: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface TrackerIssueLinkRow {
  work_item_id: string;
  rule_id: string;
  connection_id: string;
  external_id: string;
  external_key: string;
  external_url: string;
  synced_title: string;
  synced_description: string | null;
  synced_state_group: string;
  synced_priority: string;
  remote_updated_at: number;
  created_at: number;
  updated_at: number;
}

function millis(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function optionalMillis(value: Date | string | number | undefined): number | null {
  return value === undefined ? null : millis(value);
}

/** Only the non-null entries of `fields`, so optional properties stay absent. */
function defined<T extends Record<string, unknown>>(
  fields: T
): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)
  ) as { [K in keyof T]?: NonNullable<T[K]> };
}

export function trackerConnectionToDatabase(connection: TrackerConnection): TrackerConnectionRow {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    slug: connection.slug,
    space_id: connection.spaceId,
    site_url: connection.siteUrl ?? null,
    account_email: connection.accountEmail ?? null,
    account_name: connection.accountName ?? null,
    status: connection.status,
    last_error: connection.lastError ?? null,
    last_checked_at: optionalMillis(connection.lastCheckedAt),
    created_at: millis(connection.createdAt),
    updated_at: millis(connection.updatedAt),
  };
}

export function trackerConnectionFromDatabase(row: TrackerConnectionRow): TrackerConnection {
  return {
    id: row.id,
    provider: row.provider as TrackerProvider,
    name: row.name,
    slug: row.slug,
    spaceId: row.space_id,
    ...defined({
      siteUrl: row.site_url,
      accountEmail: row.account_email,
      accountName: row.account_name,
    }),
    status: row.status as TrackerConnectionStatus,
    ...defined({ lastError: row.last_error }),
    ...(row.last_checked_at !== null ? { lastCheckedAt: new Date(row.last_checked_at) } : {}),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function trackerSyncRuleToDatabase(rule: TrackerSyncRule): TrackerSyncRuleRow {
  return {
    id: rule.id,
    connection_id: rule.connectionId,
    project_id: rule.projectId,
    scope: rule.scope,
    direction: rule.direction,
    interval_minutes: rule.intervalMinutes,
    enabled: rule.enabled ? 1 : 0,
    cursor: optionalMillis(rule.cursor),
    last_run_at: optionalMillis(rule.lastRunAt),
    last_run: rule.lastRun ? JSON.stringify(rule.lastRun) : null,
    last_error: rule.lastError ?? null,
    created_at: millis(rule.createdAt),
    updated_at: millis(rule.updatedAt),
  };
}

export function trackerSyncRuleFromDatabase(row: TrackerSyncRuleRow): TrackerSyncRule {
  return {
    id: row.id,
    connectionId: row.connection_id,
    projectId: row.project_id,
    scope: row.scope,
    direction: row.direction as TrackerSyncDirection,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled === 1,
    ...(row.cursor !== null ? { cursor: new Date(row.cursor) } : {}),
    ...(row.last_run_at !== null ? { lastRunAt: new Date(row.last_run_at) } : {}),
    ...(row.last_run !== null
      ? { lastRun: JSON.parse(row.last_run) as TrackerSyncRunSummary }
      : {}),
    ...defined({ lastError: row.last_error }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function trackerIssueLinkToDatabase(link: TrackerIssueLink): TrackerIssueLinkRow {
  return {
    work_item_id: link.workItemId,
    rule_id: link.ruleId,
    connection_id: link.connectionId,
    external_id: link.externalId,
    external_key: link.externalKey,
    external_url: link.externalUrl,
    synced_title: link.syncedTitle,
    synced_description: link.syncedDescription ?? null,
    synced_state_group: link.syncedStateGroup,
    synced_priority: link.syncedPriority,
    remote_updated_at: millis(link.remoteUpdatedAt),
    created_at: millis(link.createdAt),
    updated_at: millis(link.updatedAt),
  };
}

export function trackerIssueLinkFromDatabase(row: TrackerIssueLinkRow): TrackerIssueLink {
  return {
    workItemId: row.work_item_id,
    ruleId: row.rule_id,
    connectionId: row.connection_id,
    externalId: row.external_id,
    externalKey: row.external_key,
    externalUrl: row.external_url,
    syncedTitle: row.synced_title,
    ...defined({ syncedDescription: row.synced_description }),
    syncedStateGroup: row.synced_state_group as StateGroup,
    syncedPriority: row.synced_priority as Priority,
    remoteUpdatedAt: new Date(row.remote_updated_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
