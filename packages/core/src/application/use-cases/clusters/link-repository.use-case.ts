import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { LinkEntityInput, LinkRepositoryResult } from './types.js';

@injectable()
export class LinkRepositoryUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IRepositoryRepository') private readonly repoRepo: IRepositoryRepository
  ) {}

  async execute(input: LinkEntityInput): Promise<LinkRepositoryResult> {
    const cluster = await this.clusterRepo.findById(input.clusterId);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${input.clusterId}"` };
    }

    const repository = await this.repoRepo.findById(input.entityId);
    if (!repository) {
      return { ok: false, error: `Repository not found: "${input.entityId}"` };
    }

    const link = await this.clusterRepo.linkRepository(input.clusterId, input.entityId);
    return { ok: true, link };
  }
}
