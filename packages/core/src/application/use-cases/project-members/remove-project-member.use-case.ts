import { injectable, inject } from 'tsyringe';
import type { IPmProjectMemberRepository } from '../../ports/output/repositories/pm-project-member-repository.interface.js';

export interface RemoveProjectMemberInput {
  projectId: string;
  userId: string;
  actorId: string;
}

export type RemoveProjectMemberResult = { ok: true } | { ok: false; error: string };

@injectable()
export class RemoveProjectMemberUseCase {
  constructor(
    @inject('IPmProjectMemberRepository')
    private readonly memberRepo: IPmProjectMemberRepository
  ) {}

  async execute(input: RemoveProjectMemberInput): Promise<RemoveProjectMemberResult> {
    // Check actor has Admin role
    const actorMember = await this.memberRepo.findByProjectAndUser(input.projectId, input.actorId);
    if (!actorMember || actorMember.role !== 'Admin') {
      return { ok: false, error: 'Only project admins can remove members.' };
    }

    const targetMember = await this.memberRepo.findByProjectAndUser(input.projectId, input.userId);
    if (!targetMember) {
      return { ok: false, error: 'User is not a member of this project.' };
    }

    // Prevent removing the last admin
    if (targetMember.role === 'Admin') {
      const adminCount = await this.memberRepo.countAdmins(input.projectId);
      if (adminCount <= 1) {
        return { ok: false, error: 'Cannot remove the last admin from a project.' };
      }
    }

    await this.memberRepo.softDelete(targetMember.id);
    return { ok: true };
  }
}
