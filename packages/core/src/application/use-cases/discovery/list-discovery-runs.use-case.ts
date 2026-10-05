/** ListDiscoveryRunsUseCase (spec 128): a space's discovery runs, newest first. */

import { injectable, inject } from 'tsyringe';
import type { DiscoveryRun } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IDiscoveryRunRepository } from '../../ports/output/repositories/discovery-run-repository.interface.js';
import { resolveScope, type OpportunityResult } from '../opportunities/opportunity-scope.js';

@injectable()
export class ListDiscoveryRunsUseCase {
  constructor(
    @inject('IDiscoveryRunRepository') private readonly runs: IDiscoveryRunRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  /** `space` is a space id or slug; the default space when omitted. */
  async execute(space?: string): Promise<OpportunityResult<{ runs: DiscoveryRun[] }>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    return { ok: true, runs: await this.runs.listBySpace(scope.space.id) };
  }
}
