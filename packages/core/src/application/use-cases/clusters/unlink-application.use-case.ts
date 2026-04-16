import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { LinkEntityInput, UnlinkApplicationResult } from './types.js';

@injectable()
export class UnlinkApplicationUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(input: LinkEntityInput): Promise<UnlinkApplicationResult> {
    await this.clusterRepo.unlinkApplication(input.clusterId, input.entityId);
    return { ok: true };
  }
}
