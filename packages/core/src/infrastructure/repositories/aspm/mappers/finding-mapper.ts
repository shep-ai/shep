/**
 * SecurityFinding Database Mapper
 *
 * Feature 098, phase 3. Maps between the SecurityFinding domain object
 * and rows in the security_findings table (migration 108).
 *
 * Cross-platform note (packages/CLAUDE.md): every path-bearing field is
 * normalized to POSIX separators on write so dedup and queries behave
 * identically on Windows, macOS, and Linux.
 */

import type {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  SecurityFinding,
} from '../../../../domain/generated/output.js';

export interface SecurityFindingRow {
  id: string;
  workspace_id: string | null;
  application_id: string;
  service_id: string | null;
  api_asset_id: string | null;
  cloud_environment_id: string | null;
  finding_domain: string;
  rule_id: string;
  title: string;
  description: string;
  location_path: string | null;
  location_line: number | null;
  scanner_raw: string | null;
  scanner_raw_hash: string | null;
  raw_severity: string;
  canonical_severity: string;
  cve_id: string | null;
  cwe_id: string | null;
  owasp_asvs_control_id: string | null;
  kev: number | null;
  epss_percentile: number | null;
  owner_id: string | null;
  state: string;
  current_risk_score_id: string | null;
  work_item_id: string | null;
  source: string;
  discovered_at: number;
  last_seen_at: number;
  first_fixed_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function toMillisOpt(value: Date | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value.getTime() : value;
}

function normalizePosix(p: string | undefined | null): string | null {
  if (p === undefined || p === null || p.length === 0) return null;
  return p.replace(/\\/g, '/');
}

export function toDatabase(finding: SecurityFinding): SecurityFindingRow {
  return {
    id: finding.id,
    workspace_id: null,
    application_id: finding.applicationId,
    service_id: finding.serviceId ?? null,
    api_asset_id: finding.apiAssetId ?? null,
    cloud_environment_id: finding.cloudEnvironmentId ?? null,
    finding_domain: finding.findingDomain,
    rule_id: finding.ruleId,
    title: finding.title,
    description: finding.description,
    location_path: normalizePosix(finding.locationPath),
    location_line: finding.locationLine ?? null,
    scanner_raw: finding.scannerRaw ?? null,
    scanner_raw_hash: finding.scannerRawHash ?? null,
    raw_severity: finding.rawSeverity,
    canonical_severity: finding.canonicalSeverity,
    cve_id: finding.cveId ?? null,
    cwe_id: finding.cweId ?? null,
    owasp_asvs_control_id: finding.owaspAsvsControlId ?? null,
    kev: finding.kev === undefined ? null : finding.kev ? 1 : 0,
    epss_percentile: finding.epssPercentile ?? null,
    owner_id: finding.ownerId ?? null,
    state: finding.state,
    current_risk_score_id: finding.currentRiskScoreId ?? null,
    work_item_id: finding.workItemId ?? null,
    source: finding.source,
    discovered_at: toMillis(finding.discoveredAt as Date),
    last_seen_at: toMillis(finding.lastSeenAt as Date),
    first_fixed_at: toMillisOpt(finding.firstFixedAt as Date | undefined),
    created_at: toMillis(finding.createdAt),
    updated_at: toMillis(finding.updatedAt),
    deleted_at: finding.deletedAt ? toMillis(finding.deletedAt) : null,
  };
}

export function fromDatabase(row: SecurityFindingRow): SecurityFinding {
  return {
    id: row.id,
    applicationId: row.application_id,
    serviceId: row.service_id ?? undefined,
    apiAssetId: row.api_asset_id ?? undefined,
    cloudEnvironmentId: row.cloud_environment_id ?? undefined,
    findingDomain: row.finding_domain as FindingDomain,
    ruleId: row.rule_id,
    title: row.title,
    description: row.description,
    locationPath: row.location_path ?? undefined,
    locationLine: row.location_line ?? undefined,
    scannerRaw: row.scanner_raw ?? undefined,
    scannerRawHash: row.scanner_raw_hash ?? undefined,
    rawSeverity: row.raw_severity,
    canonicalSeverity: row.canonical_severity as CanonicalSeverity,
    cveId: row.cve_id ?? undefined,
    cweId: row.cwe_id ?? undefined,
    owaspAsvsControlId: row.owasp_asvs_control_id ?? undefined,
    kev: row.kev === null ? undefined : row.kev === 1,
    epssPercentile: row.epss_percentile ?? undefined,
    ownerId: row.owner_id ?? undefined,
    state: row.state as FindingState,
    currentRiskScoreId: row.current_risk_score_id ?? undefined,
    workItemId: row.work_item_id ?? undefined,
    source: row.source,
    discoveredAt: new Date(row.discovered_at),
    lastSeenAt: new Date(row.last_seen_at),
    firstFixedAt: row.first_fixed_at !== null ? new Date(row.first_fixed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
