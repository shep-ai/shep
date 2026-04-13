import { injectable, inject } from 'tsyringe';
import type { PmProjectMember } from '../../../domain/generated/output.js';
import type { IPmProjectMemberRepository } from '../../ports/output/repositories/pm-project-member-repository.interface.js';

export type ListProjectMembersResult =
  | { ok: true; members: PmProjectMember[] }
  | { ok: false; error: string };

@injectable()
export class ListProjectMembersUseCase {
  constructor(
    @inject('IPmProjectMemberRepository')
    private readonly memberRepo: IPmProjectMemberRepository
  ) {}

  async execute(projectId: string): Promise<ListProjectMembersResult> {
    if (!projectId) {
      return { ok: false, error: 'Project ID is required.' };
    }

    const members = await this.memberRepo.listByProject(projectId);
    return { ok: true, members };
  }
}
