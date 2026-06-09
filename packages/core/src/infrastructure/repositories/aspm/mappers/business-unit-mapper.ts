/**
 * BusinessUnit Database Mapper
 *
 * Feature 098, phase 2. Maps between the BusinessUnit domain object and
 * SQLite rows in the business_units table (migration 104).
 */

import type { BusinessUnit } from '../../../../domain/generated/output.js';

export interface BusinessUnitRow {
  id: string;
  name: string;
  slug: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(bu: BusinessUnit): BusinessUnitRow {
  return {
    id: bu.id,
    name: bu.name,
    slug: bu.slug ?? null,
    created_at: toMillis(bu.createdAt),
    updated_at: toMillis(bu.updatedAt),
    deleted_at: bu.deletedAt ? toMillis(bu.deletedAt) : null,
  };
}

export function fromDatabase(row: BusinessUnitRow): BusinessUnit {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
