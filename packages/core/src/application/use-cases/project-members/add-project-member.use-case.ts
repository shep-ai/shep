import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmProjectMember, ProjectRole } from '../../../domain/generated/output.js';
import type { IPmProjectMemberRepository } from '../../ports/output/repositories/pm-project-member-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IPmUserRepository } from '../../ports/output/repositories/pm-user-repository.interface.js';

export interface AddProjectMemberInput {
  projectId: string;
  userId: string;
  role: ProjectRole;
  actorId: string;
}

export type AddProjectMemberResult =
  | { ok: true; member: PmProjectMember }
  | { ok: false; error: string };

@injectable()
export class AddProjectMemberUseCase {
  constructor(
    @inject('IPmProjectMemberRepository')
    private readonly memberRepo: IPmProjectMemberRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IPmUserRepository') private readonly userRepo: IPmUserRepository
  ) {}

  async execute(input: AddProjectMemberInput): Promise<AddProjectMemberResult> {
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: 'Project not found.' };
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      return { ok: false, error: 'User not found.' };
    }

    // Check actor has Admin role
    const actorMember = await this.memberRepo.findByProjectAndUser(input.projectId, input.actorId);
    if (!actorMember || actorMember.role !== 'Admin') {
      return { ok: false, error: 'Only project admins can add members.' };
    }

    // Check user isn't already a member
    const existing = await this.memberRepo.findByProjectAndUser(input.projectId, input.userId);
    if (existing) {
      return { ok: false, error: 'User is already a member of this project.' };
    }

    const now = new Date();
    const member: PmProjectMember = {
      id: randomUUID(),
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };

    await this.memberRepo.create(member);
    return { ok: true, member };
  }
}
