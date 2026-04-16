import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { GetClusterResult } from './types.js';

@injectable()
export class GetClusterUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(id: string): Promise<GetClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }
    return { ok: true, cluster };
  }
}
