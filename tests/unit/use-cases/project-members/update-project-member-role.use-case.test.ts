import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateProjectMemberRoleUseCase } from '@/application/use-cases/project-members/update-project-member-role.use-case.js';
import type { IPmProjectMemberRepository } from '@/application/ports/output/repositories/pm-project-member-repository.interface.js';
import { ProjectRole } from '@/domain/generated/output.js';
import type { PmProjectMember } from '@/domain/generated/output.js';

function makeMember(overrides: Partial<PmProjectMember> = {}): PmProjectMember {
  return {
    id: 'member-1',
    projectId: 'proj-1',
    userId: 'admin-1',
    role: ProjectRole.Admin,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PmProjectMember;
}

describe('UpdateProjectMemberRoleUseCase', () => {
  let useCase: UpdateProjectMemberRoleUseCase;
  let memberRepo: IPmProjectMemberRepository;

  beforeEach(() => {
    memberRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findByProjectAndUser: vi.fn().mockResolvedValue(null),
      listByProject: vi.fn().mockResolvedValue([]),
      listByUser: vi.fn().mockResolvedValue([]),
      updateRole: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      countAdmins: vi.fn().mockResolvedValue(2),
    };

    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (_projId, userId) => {
      if (userId === 'admin-1') return makeMember();
      if (userId === 'user-2')
        return makeMember({ id: 'member-2', userId: 'user-2', role: ProjectRole.Member });
      return null;
    });

    useCase = new UpdateProjectMemberRoleUseCase(memberRepo);
  });

  it('updates role when actor is admin', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'user-2',
      newRole: ProjectRole.Admin,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(true);
    expect(memberRepo.updateRole).toHaveBeenCalledWith('member-2', ProjectRole.Admin);
  });

  it('rejects when actor is not admin', async () => {
    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (_projId, userId) => {
      if (userId === 'non-admin')
        return makeMember({ role: ProjectRole.Member, userId: 'non-admin' });
      return null;
    });

    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'user-2',
      newRole: ProjectRole.Admin,
      actorId: 'non-admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('admin');
    }
  });

  it('rejects when target is not a member', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'unknown-user',
      newRole: ProjectRole.Admin,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not a member');
    }
  });

  it('prevents demoting the last admin', async () => {
    vi.mocked(memberRepo.countAdmins).mockResolvedValue(1);
    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (_projId, userId) => {
      if (userId === 'admin-1') return makeMember();
      if (userId === 'admin-2')
        return makeMember({ id: 'member-2', userId: 'admin-2', role: ProjectRole.Admin });
      return null;
    });

    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'admin-2',
      newRole: ProjectRole.Member,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('last admin');
    }
  });
});
