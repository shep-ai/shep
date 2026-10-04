import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetSpacesOverviewUseCase } from '@/application/use-cases/spaces/get-spaces-overview.use-case.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import {
  SpaceResolutionSource,
  SpaceRuleKind,
  type ProductLine,
  type Space,
} from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockProjectMemoryRepository,
  createMockSpaceMembershipRepository,
  createMockSpaceRepository,
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
const PAYMENTS: ProductLine = {
  id: 'line-pay',
  spaceId: ACME.id,
  name: 'Payments',
  slug: 'payments',
  createdAt: T,
  updatedAt: T,
};

describe('GetSpacesOverviewUseCase', () => {
  let useCase: GetSpacesOverviewUseCase;
  let resolve: { executeMany: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const spaces = createMockSpaceRepository({
      list: vi.fn().mockResolvedValue([DEFAULT_SPACE, ACME]),
    });
    const lines = createMockProductLineRepository({
      listAll: vi.fn().mockResolvedValue([PAYMENTS]),
    });
    const membership = createMockSpaceMembershipRepository({
      listRules: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          spaceId: ACME.id,
          kind: SpaceRuleKind.Remote,
          pattern: 'github.com/acme/*',
          priority: 100,
          createdAt: T,
          updatedAt: T,
        },
      ]),
      listAssignments: vi
        .fn()
        .mockResolvedValue([
          { repositoryPath: '/pinned/only', spaceId: ACME.id, createdAt: T, updatedAt: T },
        ]),
    });
    const memory = createMockProjectMemoryRepository({
      countBySpace: vi.fn(async (id: string) => (id === ACME.id ? 4 : 1)),
    });
    const repositories = {
      list: vi.fn().mockResolvedValue([
        { id: 'r-api', name: 'api', path: '/code/acme/api' },
        { id: 'r-blog', name: 'blog', path: '/code/me/blog' },
      ]),
    };
    resolve = {
      executeMany: vi.fn(async (paths: string[]) =>
        paths.map((repositoryPath) =>
          repositoryPath === '/code/me/blog'
            ? { repositoryPath, space: DEFAULT_SPACE, source: SpaceResolutionSource.Default }
            : {
                repositoryPath,
                space: ACME,
                productLine: PAYMENTS,
                source: SpaceResolutionSource.Rule,
                rule: { id: 'r1', kind: SpaceRuleKind.Remote, pattern: 'github.com/acme/*' },
              }
        )
      ),
    };
    useCase = new GetSpacesOverviewUseCase(
      spaces,
      lines,
      membership,
      memory,
      repositories as unknown as IRepositoryRepository,
      resolve as unknown as ResolveSpaceContextUseCase
    );
  });

  it('lists every space with its lines, rules and memory count', async () => {
    const { spaces } = await useCase.execute();
    expect(spaces.map((s) => s.space.id)).toEqual([DEFAULT_SPACE.id, ACME.id]);
    const acme = spaces[1];
    expect(acme.productLines).toEqual([PAYMENTS]);
    expect(acme.rules.map((r) => r.id)).toEqual(['r1']);
    expect(acme.memoryCount).toBe(4);
    expect(acme.repositoryCount).toBe(2);
  });

  it('places registered and assigned-only repositories, each once', async () => {
    const { repositories } = await useCase.execute();
    expect(resolve.executeMany).toHaveBeenCalledWith([
      '/code/acme/api',
      '/code/me/blog',
      '/pinned/only',
    ]);
    expect(repositories).toEqual([
      {
        repositoryPath: '/code/acme/api',
        name: 'api',
        spaceId: ACME.id,
        productLineId: PAYMENTS.id,
        source: SpaceResolutionSource.Rule,
        ruleId: 'r1',
      },
      {
        repositoryPath: '/code/me/blog',
        name: 'blog',
        spaceId: DEFAULT_SPACE.id,
        source: SpaceResolutionSource.Default,
      },
      {
        repositoryPath: '/pinned/only',
        name: 'only',
        spaceId: ACME.id,
        productLineId: PAYMENTS.id,
        source: SpaceResolutionSource.Rule,
        ruleId: 'r1',
      },
    ]);
  });
});
