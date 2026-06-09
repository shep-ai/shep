import { injectable, inject } from 'tsyringe';
import type { Cluster } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { ListClustersInput } from './types.js';

@injectable()
export class ListClustersUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(input?: ListClustersInput): Promise<Cluster[]> {
    return this.clusterRepo.list(input?.status);
  }
}
