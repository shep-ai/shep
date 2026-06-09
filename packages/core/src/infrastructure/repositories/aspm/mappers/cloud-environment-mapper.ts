/**
 * CloudEnvironment Database Mapper
 *
 * Feature 098, phase 2. Maps between the CloudEnvironment domain object
 * and SQLite rows in the cloud_environments table (migration 107).
 */

import type { CloudEnvironment } from '../../../../domain/generated/output.js';

export interface CloudEnvironmentRow {
  id: string;
  name: string;
  provider: string;
  account_id: string | null;
  application_id: string;
  owner_id: string | null;
  region: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(env: CloudEnvironment): CloudEnvironmentRow {
  return {
    id: env.id,
    name: env.name,
    provider: env.provider,
    account_id: env.accountId ?? null,
    application_id: env.applicationId,
    owner_id: env.ownerId ?? null,
    region: env.region ?? null,
    created_at: toMillis(env.createdAt),
    updated_at: toMillis(env.updatedAt),
    deleted_at: env.deletedAt ? toMillis(env.deletedAt) : null,
  };
}

export function fromDatabase(row: CloudEnvironmentRow): CloudEnvironment {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    accountId: row.account_id ?? undefined,
    applicationId: row.application_id,
    ownerId: row.owner_id ?? undefined,
    region: row.region ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
