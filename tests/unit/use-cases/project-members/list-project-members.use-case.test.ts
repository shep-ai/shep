import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListProjectMembersUseCase } from '@/application/use-cases/project-members/list-project-members.use-case.js';
import type { IPmProjectMemberRepository } from '@/application/ports/output/repositories/pm-project-member-repository.interface.js';
import { ProjectRole } from '@/domain/generated/output.js';
import type { PmProjectMember } from '@/domain/generated/output.js';

function makeMember(overrides: Partial<PmProjectMember> = {}): PmProjectMember {
  return {
    id: 'member-1',
    projectId: 'proj-1',
    userId: 'user-1',
    role: ProjectRole.Admin,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PmProjectMember;
}

describe('ListProjectMembersUseCase', () => {
  let useCase: ListProjectMembersUseCase;
  let memberRepo: IPmProjectMemberRepository;

  beforeEach(() => {
    memberRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findByProjectAndUser: vi.fn().mockResolvedValue(null),
      listByProject: vi.fn().mockResolvedValue([]),
      listByUser: vi.fn().mockResolvedValue([]),
      updateRole: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      countAdmins: vi.fn().mockResolvedValue(1),
    };

    useCase = new ListProjectMembersUseCase(memberRepo);
  });

  it('returns members for a project', async () => {
    const members = [
      makeMember({ id: 'member-1', userId: 'user-1', role: ProjectRole.Admin }),
      makeMember({ id: 'member-2', userId: 'user-2', role: ProjectRole.Member }),
    ];
    vi.mocked(memberRepo.listByProject).mockResolvedValue(members);

    const result = await useCase.execute('proj-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.members).toHaveLength(2);
    }
  });

  it('returns empty list for project with no members', async () => {
    const result = await useCase.execute('proj-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.members).toHaveLength(0);
    }
  });

  it('rejects empty project ID', async () => {
    const result = await useCase.execute('');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Project ID');
    }
  });
});
