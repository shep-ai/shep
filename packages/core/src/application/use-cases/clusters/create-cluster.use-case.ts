import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import { createDefaultCluster } from '../../../domain/factories/cluster-defaults.factory.js';
import type { CreateClusterInput, CreateClusterResult } from './types.js';

@injectable()
export class CreateClusterUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(input: CreateClusterInput): Promise<CreateClusterResult> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Cluster name is required.' };
    }

    const cluster = createDefaultCluster(trimmedName, {
      description: input.description,
      argoCdEnabled: input.argoCdEnabled,
      argoCdNamespace: input.argoCdNamespace,
    });

    await this.clusterRepo.create(cluster);
    return { ok: true, cluster };
  }
}
