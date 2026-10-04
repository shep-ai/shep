import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import { SpaceResolutionSource, SpaceRuleKind, type Space } from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockSpaceMembershipRepository,
  createMockSpaceRepository,
  type MockProductLineRepository,
  type MockSpaceMembershipRepository,
  type MockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');
const ACME: Space = {
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  createdAt: T,
  updatedAt: T,
};

describe('ResolveSpaceContextUseCase', () => {
  let spaces: MockSpaceRepository;
  let lines: MockProductLineRepository;
  let membership: MockSpaceMembershipRepository;
  let repositories: { list: ReturnType<typeof vi.fn> };
  let useCase: ResolveSpaceContextUseCase;

  beforeEach(() => {
    spaces = createMockSpaceRepository({ list: vi.fn().mockResolvedValue([DEFAULT_SPACE, ACME]) });
    lines = createMockProductLineRepository();
    membership = createMockSpaceMembershipRepository();
    repositories = { list: vi.fn().mockResolvedValue([]) };
    useCase = new ResolveSpaceContextUseCase(
      spaces,
      lines,
      membership,
      repositories as unknown as IRepositoryRepository
    );
  });

  it('falls back to the default space when nothing matches', async () => {
    const context = await useCase.execute('/code/side/app');
    expect(context.space).toEqual(DEFAULT_SPACE);
    expect(context.source).toBe(SpaceResolutionSource.Default);
    expect(context.productLine).toBeUndefined();
  });

  it('looks the assignment up by the normalised path', async () => {
    membership.listAssignments.mockResolvedValue([
      { repositoryPath: 'C:/code/acme/api', spaceId: ACME.id, createdAt: T, updatedAt: T },
    ]);
    const context = await useCase.execute('C:\\code\\acme\\api\\');
    expect(context.repositoryPath).toBe('C:/code/acme/api');
    expect(context.space).toEqual(ACME);
    expect(context.source).toBe(SpaceResolutionSource.Assignment);
  });

  it('matches remote rules with the registered repository remote', async () => {
    repositories.list.mockResolvedValue([
      { path: '/somewhere/api', remoteUrl: 'https://github.com/acme/api' },
    ]);
    membership.listRules.mockResolvedValue([
      {
        id: 'r1',
        spaceId: ACME.id,
        productLineId: 'line-pay',
        kind: SpaceRuleKind.Remote,
        pattern: 'github.com/acme/*',
        priority: 100,
        createdAt: T,
        updatedAt: T,
      },
    ]);
    lines.listAll.mockResolvedValue([
      {
        id: 'line-pay',
        spaceId: ACME.id,
        name: 'Payments',
        slug: 'payments',
        createdAt: T,
        updatedAt: T,
      },
    ]);

    const context = await useCase.execute('/somewhere/api');

    expect(context.space).toEqual(ACME);
    expect(context.productLine?.id).toBe('line-pay');
    expect(context.source).toBe(SpaceResolutionSource.Rule);
    expect(context.ruleId).toBe('r1');
  });

  it('drops a product line that belongs to another space', async () => {
    membership.listAssignments.mockResolvedValue([
      {
        repositoryPath: '/a',
        spaceId: ACME.id,
        productLineId: 'line-x',
        createdAt: T,
        updatedAt: T,
      },
    ]);
    lines.listAll.mockResolvedValue([
      {
        id: 'line-x',
        spaceId: 'another-space',
        name: 'X',
        slug: 'x',
        createdAt: T,
        updatedAt: T,
      },
    ]);
    const context = await useCase.execute('/a');
    expect(context.productLine).toBeUndefined();
  });

  it('falls back to the default space when the resolved space no longer exists', async () => {
    membership.listAssignments.mockResolvedValue([
      { repositoryPath: '/a', spaceId: 'deleted-space', createdAt: T, updatedAt: T },
    ]);
    const context = await useCase.execute('/a');
    expect(context.space).toEqual(DEFAULT_SPACE);
    expect(context.source).toBe(SpaceResolutionSource.Default);
  });

  it('resolves many paths with one load of each table', async () => {
    membership.listAssignments.mockResolvedValue([
      { repositoryPath: '/work/api', spaceId: ACME.id, createdAt: T, updatedAt: T },
    ]);
    const [work, side] = await useCase.executeMany(['/work/api', '/side/app']);
    expect(work.space).toEqual(ACME);
    expect(side.space).toEqual(DEFAULT_SPACE);
    expect(membership.listAssignments).toHaveBeenCalledTimes(1);
    expect(membership.listRules).toHaveBeenCalledTimes(1);
    expect(spaces.list).toHaveBeenCalledTimes(1);
  });

  it('finds a Windows assignment regardless of path case', async () => {
    membership.listAssignments.mockResolvedValue([
      { repositoryPath: 'C:/Code/Acme/Api', spaceId: ACME.id, createdAt: T, updatedAt: T },
    ]);
    const context = await useCase.execute('c:\\code\\acme\\api');
    expect(context.space).toEqual(ACME);
  });
});
