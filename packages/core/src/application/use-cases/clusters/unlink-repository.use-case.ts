import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { LinkEntityInput, UnlinkRepositoryResult } from './types.js';

@injectable()
export class UnlinkRepositoryUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(input: LinkEntityInput): Promise<UnlinkRepositoryResult> {
    await this.clusterRepo.unlinkRepository(input.clusterId, input.entityId);
    return { ok: true };
  }
}
