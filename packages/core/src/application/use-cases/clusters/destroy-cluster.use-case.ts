import { injectable, inject } from 'tsyringe';
import { ClusterStatus } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IK3dService } from '../../ports/output/services/k3d-service.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { DestroyClusterResult } from './types.js';

/** Statuses where the cluster is already stopped — no-op on destroy. */
const ALREADY_STOPPED = new Set<ClusterStatus>([ClusterStatus.Stopped, ClusterStatus.Destroying]);

@injectable()
export class DestroyClusterUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IK3dService') private readonly k3dService: IK3dService,
    @inject('IFileSystemService') private readonly fileSystem: IFileSystemService
  ) {}

  async execute(id: string): Promise<DestroyClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }

    // Idempotent: already stopped is a no-op
    if (ALREADY_STOPPED.has(cluster.status)) {
      return { ok: true };
    }

    // Transition to Destroying
    await this.clusterRepo.update(id, { status: ClusterStatus.Destroying });

    try {
      // Delete the k3d cluster if it has a k3d name
      if (cluster.k3dClusterName) {
        await this.k3dService.deleteCluster(cluster.k3dClusterName);
      }

      // Transition to Stopped
      await this.clusterRepo.update(id, {
        status: ClusterStatus.Stopped,
        errorMessage: undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.clusterRepo.update(id, {
        status: ClusterStatus.Error,
        errorMessage: `Destroy failed: ${message}`,
      });
      return { ok: false, error: `Destroy failed: ${message}` };
    } finally {
      // Cleanup kubeconfig regardless of k3d delete outcome
      if (cluster.kubeconfigPath) {
        try {
          await this.fileSystem.removeDirectory(cluster.kubeconfigPath);
        } catch {
          // Best-effort cleanup
        }
      }

      // Unlink all repositories and applications
      try {
        const repos = await this.clusterRepo.getLinkedRepositories(id);
        for (const repo of repos) {
          await this.clusterRepo.unlinkRepository(id, repo.id);
        }
        const apps = await this.clusterRepo.getLinkedApplications(id);
        for (const app of apps) {
          await this.clusterRepo.unlinkApplication(id, app.id);
        }
      } catch {
        // Best-effort cleanup
      }
    }

    return { ok: true };
  }
}
