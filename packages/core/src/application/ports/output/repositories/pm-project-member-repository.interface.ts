/**
 * PmProjectMember Repository Interface (Output Port)
 *
 * Defines the contract for project membership persistence.
 * Manages user-project associations with role-based access control.
 */

import type { PmProjectMember, ProjectRole } from '../../../../domain/generated/output.js';

export interface IPmProjectMemberRepository {
  create(member: PmProjectMember): Promise<void>;
  findByProjectAndUser(projectId: string, userId: string): Promise<PmProjectMember | null>;
  listByProject(projectId: string): Promise<PmProjectMember[]>;
  listByUser(userId: string): Promise<PmProjectMember[]>;
  updateRole(id: string, role: ProjectRole): Promise<void>;
  softDelete(id: string): Promise<void>;
  countAdmins(projectId: string): Promise<number>;
}
