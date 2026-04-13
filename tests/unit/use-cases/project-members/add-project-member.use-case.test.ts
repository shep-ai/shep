import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddProjectMemberUseCase } from '@/application/use-cases/project-members/add-project-member.use-case.js';
import type { IPmProjectMemberRepository } from '@/application/ports/output/repositories/pm-project-member-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IPmUserRepository } from '@/application/ports/output/repositories/pm-user-repository.interface.js';
import { ProjectRole } from '@/domain/generated/output.js';
import type { PmProject, PmUser, PmProjectMember } from '@/domain/generated/output.js';

function makeProject(overrides: Partial<PmProject> = {}): PmProject {
  return {
    id: 'proj-1',
    name: 'Test Project',
    slug: 'test-project',
    identifierPrefix: 'TEST',
    workItemCounter: 0,
    estimateType: 'None',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PmProject;
}

function makeUser(overrides: Partial<PmUser> = {}): PmUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    displayName: 'Test User',
    isSystemUser: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

describe('AddProjectMemberUseCase', () => {
  let useCase: AddProjectMemberUseCase;
  let memberRepo: IPmProjectMemberRepository;
  let projectRepo: IPmProjectRepository;
  let userRepo: IPmUserRepository;

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
    projectRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeProject()),
      findBySlug: vi.fn(),
      findByIdentifierPrefix: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementWorkItemCounter: vi.fn(),
    } as unknown as IPmProjectRepository;
    userRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-2' })),
      findByEmail: vi.fn(),
      findSystemUser: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    // Actor is admin
    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (projId, userId) => {
      if (userId === 'admin-1') return makeMember();
      return null;
    });

    useCase = new AddProjectMemberUseCase(memberRepo, projectRepo, userRepo);
  });

  it('adds a new member when actor is admin', async () => {
    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'user-2',
      role: ProjectRole.Member,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.member.userId).toBe('user-2');
      expect(result.member.role).toBe('Member');
    }
    expect(memberRepo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects when actor is not admin', async () => {
    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (projId, userId) => {
      if (userId === 'non-admin') return makeMember({ role: ProjectRole.Member });
      return null;
    });

    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'user-2',
      role: ProjectRole.Member,
      actorId: 'non-admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('admin');
    }
  });

  it('rejects when user is already a member', async () => {
    vi.mocked(memberRepo.findByProjectAndUser).mockImplementation(async (projId, userId) => {
      if (userId === 'admin-1') return makeMember();
      if (userId === 'user-2') return makeMember({ id: 'member-2', userId: 'user-2' });
      return null;
    });

    const result = await useCase.execute({
      projectId: 'proj-1',
      userId: 'user-2',
      role: ProjectRole.Member,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('already a member');
    }
  });

  it('rejects when project does not exist', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({
      projectId: 'nonexistent',
      userId: 'user-2',
      role: ProjectRole.Member,
      actorId: 'admin-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Project not found');
    }
  });
});
