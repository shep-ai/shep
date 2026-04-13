import { injectable, inject } from 'tsyringe';
import type { ProjectRole } from '../../../domain/generated/output.js';
import type { IPmProjectMemberRepository } from '../../ports/output/repositories/pm-project-member-repository.interface.js';

export interface UpdateProjectMemberRoleInput {
  projectId: string;
  userId: string;
  newRole: ProjectRole;
  actorId: string;
}

export type UpdateProjectMemberRoleResult = { ok: true } | { ok: false; error: string };

@injectable()
export class UpdateProjectMemberRoleUseCase {
  constructor(
    @inject('IPmProjectMemberRepository')
    private readonly memberRepo: IPmProjectMemberRepository
  ) {}

  async execute(input: UpdateProjectMemberRoleInput): Promise<UpdateProjectMemberRoleResult> {
    // Check actor has Admin role
    const actorMember = await this.memberRepo.findByProjectAndUser(input.projectId, input.actorId);
    if (!actorMember || actorMember.role !== 'Admin') {
      return { ok: false, error: 'Only project admins can change member roles.' };
    }

    const targetMember = await this.memberRepo.findByProjectAndUser(input.projectId, input.userId);
    if (!targetMember) {
      return { ok: false, error: 'User is not a member of this project.' };
    }

    // Prevent demoting the last admin
    if (targetMember.role === 'Admin' && input.newRole !== 'Admin') {
      const adminCount = await this.memberRepo.countAdmins(input.projectId);
      if (adminCount <= 1) {
        return { ok: false, error: 'Cannot demote the last admin of a project.' };
      }
    }

    await this.memberRepo.updateRole(targetMember.id, input.newRole);
    return { ok: true };
  }
}
