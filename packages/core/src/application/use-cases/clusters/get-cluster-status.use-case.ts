import { injectable, inject } from 'tsyringe';
import { ClusterStatus } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IKubectlService } from '../../ports/output/services/kubectl-service.interface.js';
import type { IArgoCDService } from '../../ports/output/services/argocd-service.interface.js';
import type { GetClusterStatusResult, ClusterStatusResult } from './types.js';

@injectable()
export class GetClusterStatusUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IKubectlService') private readonly kubectlService: IKubectlService,
    @inject('IArgoCDService') private readonly argoCdService: IArgoCDService
  ) {}

  async execute(id: string): Promise<GetClusterStatusResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }

    const result: ClusterStatusResult = { cluster };

    // Only query live data when cluster is Ready and has a kubeconfig
    if (cluster.status === ClusterStatus.Ready && cluster.kubeconfigPath) {
      try {
        const pods = await this.kubectlService.getPods(cluster.kubeconfigPath, 'default');
        const services = await this.kubectlService.getServices(cluster.kubeconfigPath, 'default');

        result.live = {
          pods,
          services,
          podCount: pods.length,
          serviceCount: services.length,
        };

        // Include ArgoCD status if enabled
        if (cluster.argoCdEnabled) {
          try {
            const argoStatus = await this.argoCdService.getStatus(
              cluster.kubeconfigPath,
              cluster.argoCdNamespace
            );
            if (argoStatus.installed) {
              result.live.argocd = [];
            }
          } catch {
            // ArgoCD query failed — omit from result, no error
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.error = `Failed to query live cluster data: ${message}`;
      }
    }

    return { ok: true, status: result };
  }
}
