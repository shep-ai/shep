import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { LinkEntityInput, LinkApplicationResult } from './types.js';

@injectable()
export class LinkApplicationUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository
  ) {}

  async execute(input: LinkEntityInput): Promise<LinkApplicationResult> {
    const cluster = await this.clusterRepo.findById(input.clusterId);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${input.clusterId}"` };
    }

    const application = await this.appRepo.findById(input.entityId);
    if (!application) {
      return { ok: false, error: `Application not found: "${input.entityId}"` };
    }

    const link = await this.clusterRepo.linkApplication(input.clusterId, input.entityId);
    return { ok: true, link };
  }
}
