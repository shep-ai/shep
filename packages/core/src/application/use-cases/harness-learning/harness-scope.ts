/**
 * The learned-harness scope of a repository (spec 150): its normalised path
 * plus the space and product line it belongs to, resolved by the one place
 * that decides the space boundary.
 */

import type { HarnessScopeKey } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

export async function harnessScopeFor(
  spaceContext: ResolveSpaceContextUseCase,
  repositoryPath: string
): Promise<HarnessScopeKey> {
  const context = await spaceContext.execute(repositoryPath);
  return {
    repositoryPath,
    spaceId: context.space.id,
    ...(context.productLine ? { productLineId: context.productLine.id } : {}),
  };
}
