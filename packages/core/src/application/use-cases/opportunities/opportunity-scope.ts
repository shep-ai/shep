/**
 * Shared lookups for the opportunity use cases (spec 126): the space (and
 * product line) a signal or opportunity belongs to, and a space's weights.
 */

import type { OpportunityWeights, ProductLine, Space } from '../../../domain/generated/output.js';
import { DEFAULT_OPPORTUNITY_WEIGHTS } from '../../../domain/shared/opportunity-score.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IOpportunityWeightsRepository } from '../../ports/output/repositories/opportunity-repository.interface.js';
import { failure, findProductLine, findSpace, type SpaceResult } from '../spaces/space-refs.js';

export type OpportunityResult<T extends object = object> = SpaceResult<T>;
export { failure };

export interface ScopeRefs {
  /** Space id or slug; the default space when omitted. */
  space?: string;
  /** Product line id or slug within the space. */
  productLine?: string;
}

/** The space and product line named by `refs`, or why they cannot be found. */
export async function resolveScope(
  spaces: ISpaceRepository,
  productLines: IProductLineRepository,
  refs: ScopeRefs
): Promise<OpportunityResult<{ space: Space; productLine?: ProductLine }>> {
  const space = refs.space?.trim()
    ? await findSpace(spaces, refs.space)
    : await spaces.getDefault();
  if (!space) return failure(`No space "${refs.space}".`);
  if (!refs.productLine?.trim()) return { ok: true, space };
  const productLine = await findProductLine(productLines, space, refs.productLine);
  if (!productLine) return failure(`No product line "${refs.productLine}" in ${space.name}.`);
  return { ok: true, space, productLine };
}

/** The space's own weights, or the defaults. */
export async function weightsFor(
  weights: IOpportunityWeightsRepository,
  spaceId: string
): Promise<OpportunityWeights> {
  return (await weights.find(spaceId)) ?? { spaceId, ...DEFAULT_OPPORTUNITY_WEIGHTS };
}
