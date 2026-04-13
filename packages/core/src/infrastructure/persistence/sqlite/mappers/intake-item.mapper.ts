/**
 * IntakeItem Database Mapper
 *
 * Maps between IntakeItem domain objects and SQLite database rows.
 */

import type { IntakeItem } from '../../../../domain/generated/output.js';

export interface IntakeItemRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  source: string;
  status: string;
  triage_notes: string | null;
  suggested_state_id: string | null;
  suggested_priority: string | null;
  suggested_labels: string | null;
  suggested_assignee_id: string | null;
  resulting_work_item_id: string | null;
  decline_reason: string | null;
  duplicate_of_work_item_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(item: IntakeItem): IntakeItemRow {
  return {
    id: item.id,
    project_id: item.projectId,
    title: item.title,
    description: item.description ?? null,
    source: item.source,
    status: item.status,
    triage_notes: item.triageNotes ?? null,
    suggested_state_id: item.suggestedStateId ?? null,
    suggested_priority: item.suggestedPriority ?? null,
    suggested_labels: item.suggestedLabels ?? null,
    suggested_assignee_id: item.suggestedAssigneeId ?? null,
    resulting_work_item_id: item.resultingWorkItemId ?? null,
    decline_reason: item.declineReason ?? null,
    duplicate_of_work_item_id: item.duplicateOfWorkItemId ?? null,
    created_at: item.createdAt instanceof Date ? item.createdAt.getTime() : item.createdAt,
    updated_at: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
    deleted_at: item.deletedAt
      ? item.deletedAt instanceof Date
        ? item.deletedAt.getTime()
        : item.deletedAt
      : null,
  };
}

export function fromDatabase(row: IntakeItemRow): IntakeItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    source: row.source,
    status: row.status as IntakeItem['status'],
    triageNotes: row.triage_notes ?? undefined,
    suggestedStateId: row.suggested_state_id ?? undefined,
    suggestedPriority: row.suggested_priority ?? undefined,
    suggestedLabels: row.suggested_labels ?? undefined,
    suggestedAssigneeId: row.suggested_assignee_id ?? undefined,
    resultingWorkItemId: row.resulting_work_item_id ?? undefined,
    declineReason: row.decline_reason ?? undefined,
    duplicateOfWorkItemId: row.duplicate_of_work_item_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
