/**
 * Service Database Mapper
 *
 * Feature 098, phase 2. Maps between the Service domain object and SQLite
 * rows in the services table (migration 105).
 */

import type { Exposure, Service } from '../../../../domain/generated/output.js';

export interface ServiceRow {
  id: string;
  name: string;
  slug: string | null;
  application_id: string;
  owner_id: string | null;
  exposure: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(service: Service): ServiceRow {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug ?? null,
    application_id: service.applicationId,
    owner_id: service.ownerId ?? null,
    exposure: service.exposure ?? null,
    created_at: toMillis(service.createdAt),
    updated_at: toMillis(service.updatedAt),
    deleted_at: service.deletedAt ? toMillis(service.deletedAt) : null,
  };
}

export function fromDatabase(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    applicationId: row.application_id,
    ownerId: row.owner_id ?? undefined,
    exposure: (row.exposure as Exposure | null) ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
