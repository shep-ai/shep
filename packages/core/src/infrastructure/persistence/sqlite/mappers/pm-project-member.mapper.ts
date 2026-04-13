import type { PmProjectMember, ProjectRole } from '../../../../domain/generated/output.js';

export interface PmProjectMemberRow {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(member: PmProjectMember): PmProjectMemberRow {
  return {
    id: member.id,
    project_id: member.projectId,
    user_id: member.userId,
    role: member.role,
    created_at: member.createdAt instanceof Date ? member.createdAt.getTime() : member.createdAt,
    updated_at: member.updatedAt instanceof Date ? member.updatedAt.getTime() : member.updatedAt,
    deleted_at: member.deletedAt
      ? member.deletedAt instanceof Date
        ? member.deletedAt.getTime()
        : member.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmProjectMemberRow): PmProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role as ProjectRole,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
