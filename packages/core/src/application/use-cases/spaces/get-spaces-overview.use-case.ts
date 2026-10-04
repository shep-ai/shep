/**
 * GetSpacesOverviewUseCase (spec 120)
 *
 * Everything the Spaces page and `shep space ls` show in one call: each space
 * with its product lines, rules and memory count, and every known repository
 * (registered or explicitly assigned) with the space it lands in and why.
 */

import { injectable, inject } from 'tsyringe';
import type {
  ProductLine,
  Space,
  SpaceResolutionSource,
  SpaceRule,
} from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import { spacePathKey } from '../../../domain/shared/space-resolution.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '../../ports/output/repositories/space-membership-repository.interface.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import { ResolveSpaceContextUseCase } from './resolve-space-context.use-case.js';

export interface SpaceOverview {
  space: Space;
  productLines: ProductLine[];
  rules: SpaceRule[];
  /** Memory entries of any scope that belong to the space. */
  memoryCount: number;
  /** Known repositories that resolve into the space. */
  repositoryCount: number;
}

export interface RepositoryPlacement {
  repositoryPath: string;
  name: string;
  spaceId: string;
  productLineId?: string;
  source: SpaceResolutionSource;
  ruleId?: string;
}

export interface SpacesOverview {
  spaces: SpaceOverview[];
  repositories: RepositoryPlacement[];
}

function lastSegment(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

@injectable()
export class GetSpacesOverviewUseCase {
  constructor(
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('ISpaceMembershipRepository') private readonly membership: ISpaceMembershipRepository,
    @inject('IProjectMemoryRepository') private readonly memory: IProjectMemoryRepository,
    @inject('IRepositoryRepository') private readonly repositories: IRepositoryRepository,
    @inject(ResolveSpaceContextUseCase) private readonly resolve: ResolveSpaceContextUseCase
  ) {}

  async execute(): Promise<SpacesOverview> {
    const [spaces, productLines, rules, assignments, registered] = await Promise.all([
      this.spaces.list(),
      this.productLines.listAll(),
      this.membership.listRules(),
      this.membership.listAssignments(),
      this.repositories.list(),
    ]);

    const names = new Map<string, { path: string; name: string }>();
    for (const repository of registered) {
      const path = normalizePath(repository.path);
      names.set(spacePathKey(path), { path, name: repository.name });
    }
    for (const assignment of assignments) {
      const path = normalizePath(assignment.repositoryPath);
      if (!names.has(spacePathKey(path)))
        names.set(spacePathKey(path), { path, name: lastSegment(path) });
    }

    const known = [...names.values()];
    const contexts = await this.resolve.executeMany(known.map((k) => k.path));
    const placements: RepositoryPlacement[] = contexts.map((context, index) => ({
      repositoryPath: known[index].path,
      name: known[index].name,
      spaceId: context.space.id,
      ...(context.productLine ? { productLineId: context.productLine.id } : {}),
      source: context.source,
      ...(context.rule ? { ruleId: context.rule.id } : {}),
    }));

    const overviews = await Promise.all(
      spaces.map(async (space) => ({
        space,
        productLines: productLines.filter((line) => line.spaceId === space.id),
        rules: rules.filter((rule) => rule.spaceId === space.id),
        memoryCount: await this.memory.countBySpace(space.id),
        repositoryCount: placements.filter((p) => p.spaceId === space.id).length,
      }))
    );

    return { spaces: overviews, repositories: placements };
  }
}
