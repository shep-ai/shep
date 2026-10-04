/**
 * ResolveSpaceContextUseCase (spec 120)
 *
 * Which space, and optionally which product line, a repository belongs to,
 * and why. Every Shep Brain reader and writer calls this with the repository
 * path it is working on, so this is the one place the space boundary is
 * decided. Never fails: anything unresolvable lands in the default space.
 */

import { injectable, inject } from 'tsyringe';
import type {
  ProductLine,
  Space,
  SpaceResolutionSource,
} from '../../../domain/generated/output.js';
import { SpaceResolutionSource as Source } from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import { resolveSpace, spacePathKey } from '../../../domain/shared/space-resolution.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '../../ports/output/repositories/space-membership-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';

export interface SpaceContext {
  /** The normalised repository path that was resolved. */
  repositoryPath: string;
  space: Space;
  productLine?: ProductLine;
  source: SpaceResolutionSource;
  /** The deciding rule, when `source` is `Rule`. */
  ruleId?: string;
}

@injectable()
export class ResolveSpaceContextUseCase {
  constructor(
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('ISpaceMembershipRepository') private readonly membership: ISpaceMembershipRepository,
    @inject('IRepositoryRepository') private readonly repositories: IRepositoryRepository
  ) {}

  async execute(repositoryPath: string): Promise<SpaceContext> {
    const [context] = await this.executeMany([repositoryPath]);
    return context;
  }

  /** Resolve many repositories with one read of each table (used by overviews). */
  async executeMany(repositoryPaths: readonly string[]): Promise<SpaceContext[]> {
    const [spaces, productLines, assignments, rules, repositories] = await Promise.all([
      this.spaces.list(),
      this.productLines.listAll(),
      this.membership.listAssignments(),
      this.membership.listRules(),
      this.repositories.list(),
    ]);
    const defaultSpace =
      spaces.find((space) => space.isDefault) ?? (await this.spaces.getDefault());
    const spacesById = new Map(spaces.map((space) => [space.id, space]));
    const linesById = new Map(productLines.map((line) => [line.id, line]));
    const assignmentsByPath = new Map(assignments.map((a) => [spacePathKey(a.repositoryPath), a]));
    const remotesByPath = new Map(
      repositories.map((repository) => [spacePathKey(repository.path), repository.remoteUrl])
    );

    return repositoryPaths.map((repositoryPath) => {
      const path = normalizePath(repositoryPath.trim());
      const resolved = resolveSpace({
        repositoryPath: path,
        remoteUrl: remotesByPath.get(spacePathKey(path)),
        assignment: assignmentsByPath.get(spacePathKey(path)),
        rules,
        defaultSpaceId: defaultSpace.id,
      });

      const space = spacesById.get(resolved.spaceId);
      if (!space) return { repositoryPath: path, space: defaultSpace, source: Source.Default };

      const productLine = resolved.productLineId
        ? linesById.get(resolved.productLineId)
        : undefined;
      return {
        repositoryPath: path,
        space,
        ...(productLine && productLine.spaceId === space.id ? { productLine } : {}),
        source: resolved.source,
        ...(resolved.ruleId ? { ruleId: resolved.ruleId } : {}),
      };
    });
  }
}
