/**
 * ApiAsset Database Mapper
 *
 * Feature 098, phase 2. Maps between the ApiAsset domain object and SQLite
 * rows in the api_assets table (migration 106). Normalizes schemaPath to
 * POSIX separators per packages/CLAUDE.md (cross-platform paths).
 */

import type { ApiAsset, Exposure } from '../../../../domain/generated/output.js';

export interface ApiAssetRow {
  id: string;
  name: string;
  base_url: string | null;
  application_id: string;
  owner_id: string | null;
  exposure: string | null;
  schema_path: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function toPosix(p: string | undefined): string | null {
  if (p === undefined) return null;
  return p.replace(/\\/g, '/');
}

export function toDatabase(asset: ApiAsset): ApiAssetRow {
  return {
    id: asset.id,
    name: asset.name,
    base_url: asset.baseUrl ?? null,
    application_id: asset.applicationId,
    owner_id: asset.ownerId ?? null,
    exposure: asset.exposure ?? null,
    schema_path: toPosix(asset.schemaPath),
    created_at: toMillis(asset.createdAt),
    updated_at: toMillis(asset.updatedAt),
    deleted_at: asset.deletedAt ? toMillis(asset.deletedAt) : null,
  };
}

export function fromDatabase(row: ApiAssetRow): ApiAsset {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url ?? undefined,
    applicationId: row.application_id,
    ownerId: row.owner_id ?? undefined,
    exposure: (row.exposure as Exposure | null) ?? undefined,
    schemaPath: row.schema_path ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
