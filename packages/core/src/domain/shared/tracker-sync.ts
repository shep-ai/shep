/**
 * Tracker sync rules (spec 122): how Linear and Jira statuses and priorities
 * map to shep's, and which side wins for each field when a work item and its
 * tracker issue have both moved since the last sync.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { Priority, StateGroup, TrackerSyncDirection } from '../generated/output';

// ─── Status ──────────────────────────────────────────────────────────────────

/** Linear workflow state types (state.type) and their shep groups. */
const LINEAR_STATE_GROUPS: Record<string, StateGroup> = {
  triage: StateGroup.Backlog,
  backlog: StateGroup.Backlog,
  unstarted: StateGroup.Unstarted,
  started: StateGroup.Started,
  completed: StateGroup.Completed,
  canceled: StateGroup.Cancelled,
};

/** The Linear state type to write for a shep group (Backlog prefers `backlog` over `triage`). */
export const LINEAR_STATE_TYPE_FOR_GROUP: Record<StateGroup, string> = {
  [StateGroup.Backlog]: 'backlog',
  [StateGroup.Unstarted]: 'unstarted',
  [StateGroup.Started]: 'started',
  [StateGroup.Completed]: 'completed',
  [StateGroup.Cancelled]: 'canceled',
};

export function linearStateGroup(stateType: string): StateGroup {
  return LINEAR_STATE_GROUPS[stateType] ?? StateGroup.Unstarted;
}

/** Jira status category keys. */
const JIRA_CATEGORY_NEW = 'new';
const JIRA_CATEGORY_IN_PROGRESS = 'indeterminate';
const JIRA_CATEGORY_DONE = 'done';

/** Done-category statuses that mean the work was abandoned, not finished. */
const JIRA_CANCELLED_NAME = /cancel|won'?t|reject|duplicate|declin|obsolete/i;
const JIRA_BACKLOG_NAME = /backlog/i;

/** A Jira status, from its category key and name, as a shep group. */
export function jiraStateGroup(categoryKey: string, statusName: string): StateGroup {
  if (categoryKey === JIRA_CATEGORY_DONE) {
    return JIRA_CANCELLED_NAME.test(statusName) ? StateGroup.Cancelled : StateGroup.Completed;
  }
  if (categoryKey === JIRA_CATEGORY_IN_PROGRESS) return StateGroup.Started;
  if (categoryKey === JIRA_CATEGORY_NEW && JIRA_BACKLOG_NAME.test(statusName)) {
    return StateGroup.Backlog;
  }
  return StateGroup.Unstarted;
}

// ─── Priority ────────────────────────────────────────────────────────────────

/** Linear priorities: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
const LINEAR_PRIORITIES: readonly Priority[] = [
  Priority.None,
  Priority.Urgent,
  Priority.High,
  Priority.Medium,
  Priority.Low,
];

export function linearPriority(value: number): Priority {
  return LINEAR_PRIORITIES[value] ?? Priority.None;
}

export function priorityToLinear(priority: Priority): number {
  return LINEAR_PRIORITIES.indexOf(priority);
}

const JIRA_PRIORITIES: Record<string, Priority> = {
  highest: Priority.Urgent,
  blocker: Priority.Urgent,
  critical: Priority.Urgent,
  high: Priority.High,
  major: Priority.High,
  medium: Priority.Medium,
  low: Priority.Low,
  lowest: Priority.Low,
  minor: Priority.Low,
  trivial: Priority.Low,
};

const JIRA_PRIORITY_NAMES: Partial<Record<Priority, string>> = {
  [Priority.Urgent]: 'Highest',
  [Priority.High]: 'High',
  [Priority.Medium]: 'Medium',
  [Priority.Low]: 'Low',
};

export function jiraPriority(name: string | undefined): Priority {
  if (!name) return Priority.None;
  return JIRA_PRIORITIES[name.toLowerCase()] ?? Priority.None;
}

/** The default-scheme Jira priority name for a shep priority; none for None. */
export function priorityToJiraName(priority: Priority): string | undefined {
  return JIRA_PRIORITY_NAMES[priority];
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60_000;

/** Whether an enabled rule's interval has passed since its last run (or it never ran). */
export function isTrackerRuleDue(
  rule: { enabled: boolean; intervalMinutes: number; lastRunAt?: Date | string },
  now: Date
): boolean {
  if (!rule.enabled) return false;
  if (!rule.lastRunAt) return true;
  return now.getTime() - new Date(rule.lastRunAt).getTime() >= rule.intervalMinutes * MS_PER_MINUTE;
}

// ─── Per-field sync ──────────────────────────────────────────────────────────

/** The fields kept in sync between a work item and its issue. */
export interface SyncedFields {
  title: string;
  description?: string;
  stateGroup: StateGroup;
  priority: Priority;
}

export type SyncedField = keyof SyncedFields;

const SYNCED_FIELDS: readonly SyncedField[] = ['title', 'description', 'stateGroup', 'priority'];

export interface IssueSyncPlan {
  /** Remote values to write to the work item. */
  applyLocal: Partial<SyncedFields>;
  /** Local values to write to the tracker (two-way rules only). */
  pushRemote: Partial<SyncedFields>;
  /** Fields both sides changed to different values; the remote value was taken. */
  conflicts: SyncedField[];
}

/** Text compared without line-ending, trailing-space or empty-versus-missing differences. */
function comparable(field: SyncedField, value: SyncedFields[SyncedField]): string {
  const text = value ?? '';
  return field === 'description' || field === 'title'
    ? String(text).replace(/\r\n/g, '\n').trimEnd()
    : String(text);
}

/**
 * Decide each field by comparing both sides with the values at the last sync:
 * a remote-only change is applied locally; a local-only change is pushed in a
 * two-way rule (and stays local in an import rule); a change on both sides to
 * different values takes the remote value and is reported as a conflict.
 */
export function planIssueSync(
  direction: TrackerSyncDirection,
  snapshot: SyncedFields,
  local: SyncedFields,
  remote: SyncedFields
): IssueSyncPlan {
  const plan: IssueSyncPlan = { applyLocal: {}, pushRemote: {}, conflicts: [] };
  for (const field of SYNCED_FIELDS) {
    const before = comparable(field, snapshot[field]);
    const localValue = comparable(field, local[field]);
    const remoteValue = comparable(field, remote[field]);
    const remoteChanged = remoteValue !== before;
    const localChanged = localValue !== before;

    if (remoteChanged && localChanged) {
      if (remoteValue === localValue) continue;
      (plan.applyLocal as Record<string, unknown>)[field] = remote[field];
      plan.conflicts.push(field);
    } else if (remoteChanged) {
      (plan.applyLocal as Record<string, unknown>)[field] = remote[field];
    } else if (localChanged && direction === TrackerSyncDirection.TwoWay) {
      (plan.pushRemote as Record<string, unknown>)[field] = local[field];
    }
  }
  return plan;
}
