import type { PmSession } from '../../../../domain/generated/output.js';

export interface PmSessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(session: PmSession): PmSessionRow {
  return {
    id: session.id,
    user_id: session.userId,
    token: session.token,
    expires_at: session.expiresAt instanceof Date ? session.expiresAt.getTime() : session.expiresAt,
    created_at: session.createdAt instanceof Date ? session.createdAt.getTime() : session.createdAt,
    updated_at: session.updatedAt instanceof Date ? session.updatedAt.getTime() : session.updatedAt,
    deleted_at: session.deletedAt
      ? session.deletedAt instanceof Date
        ? session.deletedAt.getTime()
        : session.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmSessionRow): PmSession {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
