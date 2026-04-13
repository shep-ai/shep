import type { PmUser } from '../../../../domain/generated/output.js';

export interface PmUserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  is_system_user: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(user: PmUser): PmUserRow {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    is_system_user: user.isSystemUser ? 1 : 0,
    created_at: user.createdAt instanceof Date ? user.createdAt.getTime() : user.createdAt,
    updated_at: user.updatedAt instanceof Date ? user.updatedAt.getTime() : user.updatedAt,
    deleted_at: user.deletedAt
      ? user.deletedAt instanceof Date
        ? user.deletedAt.getTime()
        : user.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmUserRow): PmUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    isSystemUser: row.is_system_user === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
