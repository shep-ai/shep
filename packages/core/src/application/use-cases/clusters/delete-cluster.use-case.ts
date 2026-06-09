import { injectable, inject } from 'tsyringe';
import { ClusterStatus } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IK3dService } from '../../ports/output/services/k3d-service.interface.js';
import type { DeleteClusterResult } from './types.js';

/** Statuses that require cluster destruction before deletion. */
const DESTROY_BEFORE_DELETE = new Set<ClusterStatus>([ClusterStatus.Ready, ClusterStatus.Error]);

@injectable()
export class DeleteClusterUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IK3dService') private readonly k3dService: IK3dService
  ) {}

  async execute(id: string): Promise<DeleteClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }

    // Destroy the k3d cluster if it's in a running or error state
    if (DESTROY_BEFORE_DELETE.has(cluster.status) && cluster.k3dClusterName) {
      try {
        await this.clusterRepo.update(id, { status: ClusterStatus.Destroying });
        await this.k3dService.deleteCluster(cluster.k3dClusterName);
      } catch {
        // Best-effort destruction — proceed with soft-delete regardless
      }
    }

    await this.clusterRepo.softDelete(id);
    return { ok: true };
  }
}
