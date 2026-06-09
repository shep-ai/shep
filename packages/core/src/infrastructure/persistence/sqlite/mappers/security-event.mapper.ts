/**
 * Security Event Database Mapper
 *
 * Maps between SecurityEvent domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as ISO 8601 strings (matching settings pattern)
 * - Optional fields stored as NULL when missing
 * - Enum values stored as string values
 */

import type { SecurityEvent } from '../../../../domain/generated/output.js';
import type {
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the security_events table schema.
 * Uses snake_case column names.
 */
export interface SecurityEventRow {
  id: string;
  repository_path: string;
  feature_id: string | null;
  severity: string;
  category: string;
  disposition: string;
  actor: string | null;
  message: string | null;
  remediation_summary: string | null;
  created_at: string;
}

/**
 * Maps SecurityEvent domain object to database row.
 *
 * @param event - SecurityEvent domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(event: SecurityEvent): SecurityEventRow {
  return {
    id: event.id,
    repository_path: event.repositoryPath,
    feature_id: event.featureId ?? null,
    severity: event.severity,
    category: event.category,
    disposition: event.disposition,
    actor: event.actor ?? null,
    message: event.message ?? null,
    remediation_summary: event.remediationSummary ?? null,
    created_at:
      event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
  };
}

/**
 * Maps database row to SecurityEvent domain object.
 * Converts ISO strings back to Date objects.
 *
 * @param row - Database row with snake_case columns
 * @returns SecurityEvent domain object with camelCase properties
 */
export function fromDatabase(row: SecurityEventRow): SecurityEvent {
  return {
    id: row.id,
    repositoryPath: row.repository_path,
    severity: row.severity as SecuritySeverity,
    category: row.category as SecurityActionCategory,
    disposition: row.disposition as SecurityActionDisposition,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.created_at),
    ...(row.feature_id !== null && { featureId: row.feature_id }),
    ...(row.actor !== null && { actor: row.actor }),
    ...(row.message !== null && { message: row.message }),
    ...(row.remediation_summary !== null && {
      remediationSummary: row.remediation_summary,
    }),
  };
}
