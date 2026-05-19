/**
 * FindingFilter → SQL helper (feature 098, phase 3).
 *
 * Translates the typed {@link FindingFilter} value object into a parameterized
 * WHERE clause for the security_findings table. Reused by SQLiteFindingRepository
 * (list/count) and by future rank/campaign-progress queries (research decision 9).
 *
 * All conditions ALWAYS include `deleted_at IS NULL` so soft-deleted rows
 * never leak into list/rank/count results.
 */

import type { FindingFilter } from '../../../domain/generated/output.js';

export interface SqlClause {
  /** WHERE clause body (no leading `WHERE`). */
  sql: string;
  /** Positional parameter values, in order. */
  params: unknown[];
}

function inClause(column: string, values: readonly string[], params: unknown[]): string {
  const placeholders = values.map(() => '?').join(', ');
  values.forEach((v) => params.push(v));
  return `${column} IN (${placeholders})`;
}

export function buildFindingWhereClause(filter: FindingFilter): SqlClause {
  const params: unknown[] = [];
  const conditions: string[] = ['deleted_at IS NULL'];

  if (filter.severities && filter.severities.length > 0) {
    conditions.push(inClause('canonical_severity', filter.severities, params));
  }
  if (filter.findingDomains && filter.findingDomains.length > 0) {
    conditions.push(inClause('finding_domain', filter.findingDomains, params));
  }
  if (filter.applicationIds && filter.applicationIds.length > 0) {
    conditions.push(inClause('application_id', filter.applicationIds, params));
  }
  if (filter.ownerIds && filter.ownerIds.length > 0) {
    conditions.push(inClause('owner_id', filter.ownerIds, params));
  }
  if (filter.states && filter.states.length > 0) {
    conditions.push(inClause('state', filter.states, params));
  }
  if (filter.ruleIds && filter.ruleIds.length > 0) {
    conditions.push(inClause('rule_id', filter.ruleIds, params));
  }
  if (filter.cveIds && filter.cveIds.length > 0) {
    conditions.push(inClause('cve_id', filter.cveIds, params));
  }
  if (filter.kev === true) {
    conditions.push('kev = 1');
  } else if (filter.kev === false) {
    conditions.push('(kev = 0 OR kev IS NULL)');
  }

  return { sql: conditions.join(' AND '), params };
}
