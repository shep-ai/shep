/**
 * RemediationCampaign Database Mapper
 *
 * Feature 098, phase 6 (task-37). Maps between RemediationCampaign domain
 * objects + their audit log and rows in the remediation_campaigns table
 * (migration 113).
 *
 * The targetQuery FindingFilter is JSON-encoded into target_query_json
 * — same shape that drives list-findings / rank-findings / campaign
 * progress (FR-9, FR-17). The audit log is JSON-encoded; repository
 * guarantees append-only semantics.
 */

import {
  CampaignStatus,
  type FindingFilter,
  type RemediationCampaign,
} from '../../../../domain/generated/output.js';
import type { CampaignAuditEntry } from '../../../../application/ports/output/repositories/remediation-campaign-repository.interface.js';

export interface RemediationCampaignRow {
  id: string;
  name: string;
  description: string;
  target_query_json: string;
  status: string;
  owner_id: string | null;
  due_date: number | null;
  closed_at: number | null;
  audit_log: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function ensureStatus(value: string): CampaignStatus {
  const known = Object.values(CampaignStatus) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown CampaignStatus persisted in remediation_campaigns: ${value}`);
  }
  return value as CampaignStatus;
}

export function toDatabase(
  campaign: RemediationCampaign,
  audit: CampaignAuditEntry[]
): RemediationCampaignRow {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    target_query_json: JSON.stringify(campaign.targetQuery),
    status: campaign.status,
    owner_id: campaign.ownerId ?? null,
    due_date: campaign.dueDate ? toMillis(campaign.dueDate as Date) : null,
    closed_at: campaign.closedAt ? toMillis(campaign.closedAt as Date) : null,
    audit_log: JSON.stringify(audit),
    created_at: toMillis(campaign.createdAt),
    updated_at: toMillis(campaign.updatedAt),
    deleted_at: campaign.deletedAt ? toMillis(campaign.deletedAt) : null,
  };
}

export function fromDatabase(row: RemediationCampaignRow): RemediationCampaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetQuery: parseTargetQuery(row.target_query_json),
    status: ensureStatus(row.status),
    ownerId: row.owner_id ?? undefined,
    dueDate: row.due_date !== null ? new Date(row.due_date) : undefined,
    closedAt: row.closed_at !== null ? new Date(row.closed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}

export function parseAuditLog(rawJson: string): CampaignAuditEntry[] {
  if (!rawJson) return [];
  const parsed = JSON.parse(rawJson) as unknown;
  return Array.isArray(parsed) ? (parsed as CampaignAuditEntry[]) : [];
}

export function parseTargetQuery(rawJson: string): FindingFilter {
  if (!rawJson) return {};
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed as FindingFilter;
}
